"""Internal OpenAI-compatible completion gateway (no extra HTTP service)."""

import asyncio
import hashlib
import json
from dataclasses import dataclass, field
from typing import Literal

import httpx

from app.observability import model_call, safe_usage

AI_RETRY_MAX_BACKOFF_S = 30
GATEWAY_VERSION = "completion-v1"


class _AIProviderResponseError(RuntimeError):
    pass


class CompletionUnavailableError(RuntimeError):
    """No configured attempt could run (distinct from an upstream failure)."""


def _completion_response_json(response: httpx.Response) -> dict:
    try:
        return response.json()
    except json.JSONDecodeError:
        if not response.headers.get("content-type", "").startswith("text/event-stream"):
            raise

    # Some gateways wrap even stream=false replies in one SSE event. Only unwrap
    # a complete reply; accepting actual delta chunks here would lose content.
    payloads = []
    for event in response.text.replace("\r\n", "\n").split("\n\n"):
        data = "\n".join(
            line[5:].lstrip(" ") for line in event.splitlines() if line.startswith("data:")
        )
        if data and data != "[DONE]":
            payloads.append(json.loads(data))
    if len(payloads) != 1 or not isinstance(payloads[0], dict):
        raise ValueError("Expected one complete non-streaming completion in gateway response")
    payload = payloads[0]
    if "error" not in payload and not all(
        "message" in choice for choice in payload.get("choices", [])
    ):
        raise ValueError("Gateway returned streaming chunks for a non-streaming request")
    return payload


def _message_rejects_logprobs(message: str) -> bool:
    return "logprobs" in message.lower()


def _response_rejects_logprobs(response: httpx.Response) -> bool:
    return response.status_code == 400 and _message_rejects_logprobs(response.text)


def _provider_error_message(data: object) -> str | None:
    if not isinstance(data, dict) or "error" not in data or "choices" in data:
        return None

    error = data.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str) and message.strip():
            return message
    elif isinstance(error, str) and error.strip():
        return error

    return "provider returned an error response"


_REASONING_EFFORT_REJECTION_MARKERS = (
    "reasoning_effort",
    "reasoning",
    "think value",
    "unsupported parameter",
)


def _message_rejects_reasoning_effort(message: str) -> bool:
    # Servers disagree on how they name the field they are rejecting. OpenAI answers
    # "Unsupported parameter: 'reasoning_effort' ...", while Ollama releases predating the
    # "none" effort level answer `invalid think value: "none" (must be "high", "medium",
    # "low", true, or false)` and never mention reasoning_effort at all. Matching only the
    # OpenAI wording would leave those Ollama users with every request failing, because the
    # default effort is sent on every call and the strip-and-retry would never fire.
    text = message.lower()
    return any(marker in text for marker in _REASONING_EFFORT_REJECTION_MARKERS)


def _response_rejects_reasoning_effort(response: httpx.Response) -> bool:
    return response.status_code == 400 and _message_rejects_reasoning_effort(response.text)


class AIResponseTruncatedError(RuntimeError):
    """Raised when a model's response was cut off before it produced any output content.

    Reasoning-capable models (e.g. Qwen3, DeepSeek-R1) return their chain-of-thought in a
    separate ``reasoning_content`` field, distinct from ``content``. If that reasoning
    consumes the entire completion token budget, the API reports ``finish_reason ==
    "length"`` with an empty ``content`` string. Downstream JSON parsing of an empty
    string then fails with an unhelpful message, which used to get swallowed into a
    generic "AI service is not available" error even though the endpoint responded
    successfully. This error preserves the real cause so callers can surface it.

    ``retryable`` is False for a length cutoff, because the same request under the same token
    budget is cut off again, so the tagging worker fails the job instead of rerunning it.
    """

    def __init__(self, message: str, *, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


def repeats_identically(error: BaseException | None) -> bool:
    return isinstance(error, AIResponseTruncatedError) and not error.retryable


def _reasoning_text(message: dict) -> str | None:
    return message.get("reasoning_content") or message.get("reasoning")


def _empty_response_action(
    choice: dict, can_lower_reasoning: bool
) -> Literal["lower_reasoning", "next_endpoint", "retry"]:
    # Dropping straight to no reasoning avoids replaying the same truncated request, which
    # is what turned a single slow call into a multi-minute hang. A length cutoff with
    # reasoning already at its floor is deterministic, so retrying only multiplies the wait;
    # any other empty response can be transient and keeps the normal retry budget.
    if can_lower_reasoning and _reasoning_text(choice["message"]):
        return "lower_reasoning"
    if choice.get("finish_reason") == "length":
        return "next_endpoint"
    return "retry"


def _empty_response_error(
    choice: dict, endpoint_name: str, used_model: str, max_tokens: int
) -> AIResponseTruncatedError | None:
    message = choice["message"]
    content = message.get("content")
    if content and content.strip():
        return None

    finish_reason = choice.get("finish_reason")
    reasoning = _reasoning_text(message)
    if finish_reason == "length" and reasoning:
        detail = (
            "its reasoning/thinking output consumed the entire "
            "completion token budget before it produced a response"
        )
    elif finish_reason == "length":
        detail = "the response was cut off before any content was generated"
    else:
        detail = f"finish_reason={finish_reason!r}"

    return AIResponseTruncatedError(
        f"{endpoint_name} (model: {used_model}) returned an empty response: {detail}. "
        f"Try raising AI_MAX_TOKENS (currently {max_tokens}) or disabling extended "
        "thinking/reasoning mode for this model.",
        retryable=finish_reason != "length",
    )


@dataclass
class Completion:
    content: str
    model: str
    endpoint: str
    logprobs_content: list | None = None
    usage: dict[str, int] = field(default_factory=dict)
    prompt_fingerprint: str = ""


class CompletionGateway:
    """One transport/retry policy shared by text and image-facing AIService APIs."""

    async def complete(
        self,
        messages: list,
        *,
        endpoints: list,
        settings,
        timeout: int,
        headers: dict,
        operation: str,
        use_vision_model: bool = False,
        request_logprobs: bool = False,
        temperature: float | None = None,
        backoff: bool = False,
    ) -> Completion:
        last_error = None
        every_endpoint_repeats = True
        fingerprint = hashlib.sha256(
            json.dumps(messages, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()[:16]
        for endpoint in endpoints:
            configured_models = endpoint.vision_model if use_vision_model else endpoint.text_model
            models = list(
                dict.fromkeys(m.strip() for m in configured_models.split(",") if m.strip())
            )
            for model in models:
                use_logprobs = request_logprobs
                use_reasoning_effort = bool(settings.ai_reasoning_effort)
                current_reasoning_effort = settings.ai_reasoning_effort
                async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                    attempt = 0
                    while attempt < settings.ai_max_retries:
                        body = {
                            "model": model,
                            "messages": messages,
                            "stream": False,
                            "max_tokens": settings.ai_max_tokens,
                        }
                        if temperature is not None:
                            body["temperature"] = temperature
                        if use_logprobs:
                            body.update(logprobs=True, top_logprobs=3)
                        if use_reasoning_effort and current_reasoning_effort:
                            body["reasoning_effort"] = current_reasoning_effort

                        with model_call(model, endpoint.name, operation) as observed:
                            try:
                                response = await client.post(
                                    f"{endpoint.url}/chat/completions", headers=headers, json=body
                                )
                                observed.http_status = response.status_code
                                response.raise_for_status()
                                data = _completion_response_json(response)
                                provider_error = _provider_error_message(data)
                                if provider_error is not None:
                                    observed.finish(
                                        "provider_error",
                                        data=data,
                                        http_status=response.status_code,
                                    )
                                    if use_logprobs and _message_rejects_logprobs(provider_error):
                                        use_logprobs = False
                                        observed.status = "unsupported_parameter"
                                        continue
                                    if use_reasoning_effort and _message_rejects_reasoning_effort(
                                        provider_error
                                    ):
                                        use_reasoning_effort = False
                                        observed.status = "unsupported_parameter"
                                        continue
                                    raise _AIProviderResponseError(provider_error)
                                if not isinstance(data, dict) or not data.get("choices"):
                                    raise ValueError(
                                        "Provider returned an invalid completion envelope"
                                    )
                                choice = data["choices"][0]
                                if not isinstance(choice, dict) or not isinstance(
                                    choice.get("message"), dict
                                ):
                                    raise ValueError(
                                        "Provider returned an invalid completion choice"
                                    )
                                used_model = data.get("model") or model
                                empty_error = _empty_response_error(
                                    choice, endpoint.name, used_model, settings.ai_max_tokens
                                )
                                if empty_error is None:
                                    observed.finish(
                                        "success", data=data, http_status=response.status_code
                                    )
                                    lp = choice.get("logprobs") if use_logprobs else None
                                    return Completion(
                                        content=choice["message"]["content"],
                                        model=used_model,
                                        endpoint=endpoint.name,
                                        logprobs_content=lp.get("content")
                                        if isinstance(lp, dict)
                                        else None,
                                        usage=safe_usage(data.get("usage")),
                                        prompt_fingerprint=fingerprint,
                                    )
                                last_error = empty_error
                                observed.finish(
                                    "empty_response", data=data, http_status=response.status_code
                                )
                                action = _empty_response_action(
                                    choice,
                                    use_reasoning_effort and current_reasoning_effort != "none",
                                )
                                if action == "lower_reasoning":
                                    current_reasoning_effort = "none"
                                    continue
                                if action == "next_endpoint":
                                    break
                            except httpx.HTTPStatusError as error:
                                observed.status = "http_error"
                                if use_logprobs and _response_rejects_logprobs(error.response):
                                    use_logprobs = False
                                    observed.status = "unsupported_parameter"
                                    continue
                                if use_reasoning_effort and _response_rejects_reasoning_effort(
                                    error.response
                                ):
                                    use_reasoning_effort = False
                                    observed.status = "unsupported_parameter"
                                    continue
                                last_error = error
                            except httpx.RequestError as error:
                                last_error = error
                                observed.status = "transport_error"
                            except _AIProviderResponseError as error:
                                last_error = error
                            except (ValueError, KeyError, TypeError, IndexError) as error:
                                # Malformed JSON/choices can be transient; retain fallback without
                                # logging the payload or the parser's exception text.
                                last_error = ValueError(
                                    "Provider returned an invalid completion response"
                                )
                                observed.status = "invalid_response"
                                last_error.__cause__ = error
                        attempt += 1
                        if backoff and attempt < settings.ai_max_retries:
                            await asyncio.sleep(min(2**attempt, AI_RETRY_MAX_BACKOFF_S))
                every_endpoint_repeats = every_endpoint_repeats and repeats_identically(last_error)
        if not every_endpoint_repeats and repeats_identically(last_error):
            last_error.retryable = True
        if last_error is not None:
            raise last_error
        raise CompletionUnavailableError("Failed to generate text - no endpoints available")
