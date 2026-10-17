import asyncio
import base64
import io
import json
import logging
import math
import re
from pathlib import Path
from typing import Literal

import httpx
from PIL import Image, ImageOps
from pydantic import BaseModel

from app.config import get_settings
from app.services.model_gateway import (
    AI_RETRY_MAX_BACKOFF_S as AI_RETRY_MAX_BACKOFF_S,
)
from app.services.model_gateway import (
    GATEWAY_VERSION,
    CompletionGateway,
    CompletionUnavailableError,
    repeats_identically,
)
from app.services.model_gateway import (
    AIResponseTruncatedError as AIResponseTruncatedError,
)
from app.services.model_gateway import (
    _completion_response_json as _completion_response_json,
)
from app.utils.garment_vocabulary import (
    COLORS,
    FORMALITY,
    MATERIALS,
    TYPES,
    normalize_color,
    render_tagging_prompt,
)
from app.utils.locale import DEFAULT_LOCALE
from app.utils.prompts import load_prompt

logger = logging.getLogger(__name__)


class TextGenerationResult(BaseModel):
    content: str
    model: str
    endpoint: str
    usage: dict[str, int] = {}
    gateway_version: str = GATEWAY_VERSION
    prompt_version: str = "text-v1"
    prompt_fingerprint: str = ""


class ClothingTags(BaseModel):
    type: str = "unknown"
    subtype: str | None = None
    primary_color: str | None = None
    colors: list[str] = []
    pattern: str | None = None
    material: str | None = None
    style: list[str] = []
    formality: str | None = None
    season: list[str] = []
    fit: str | None = None
    confidence: float = 0.0
    logprobs_confidence: float | None = None
    description: str | None = None
    raw_response: str | None = None
    # The model's type answer when it fell outside VALID_TYPES. Kept so "the model
    # didn't know" (type missing) stays distinguishable from "the model answered
    # something we don't support" (e.g. "culottes"), which otherwise both read "unknown".
    unrecognized_type: str | None = None

    def has_content(self) -> bool:
        return bool(
            self.type != "unknown"
            or self.unrecognized_type
            or self.subtype
            or self.primary_color
            or self.colors
            or self.pattern
            or self.material
            or self.formality
            or self.style
            or self.season
            or self.fit
        )


TAGGING_PROMPT = render_tagging_prompt(load_prompt("clothing_analysis"))
DESCRIPTION_PROMPT = load_prompt("clothing_description")
DESCRIPTION_LANGUAGES = {
    "en": "English",
    "zh-CN": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "ko": "Korean",
    "ja": "Japanese",
    "fr": "French",
    "de": "German",
    "it": "Italian",
}
# Localized replies wrap the sentence in their own script's quotes, which would otherwise
# show inside the quotes the item dialog already draws around the description.
DESCRIPTION_QUOTES = (('"', '"'), ("“", "”"), ("「", "」"), ("『", "』"), ("«", "»"))

# Valid values for validation
VALID_TYPES = set(TYPES)
VALID_COLORS = set(COLORS)
VALID_PATTERNS = {
    "solid",
    "striped",
    "plaid",
    "checkered",
    "floral",
    "graphic",
    "geometric",
    "polka-dot",
    "camouflage",
    "animal-print",
}
VALID_MATERIALS = set(MATERIALS)
VALID_FORMALITY = set(FORMALITY)
VALID_FIT = {"slim", "regular", "relaxed", "oversized", "tailored", "cropped"}
VALID_STYLES = {
    "casual",
    "classic",
    "sporty",
    "minimalist",
    "bohemian",
    "preppy",
    "streetwear",
    "elegant",
    "athletic",
    "vintage",
    "modern",
    "rugged",
}
VALID_SEASONS = {"spring", "summer", "fall", "winter", "all-season"}


def compute_tag_completeness(tags: "ClothingTags") -> float:
    score = 0.0
    if tags.type and tags.type != "unknown":
        score += 0.25
    if tags.primary_color:
        score += 0.20
    if tags.pattern:
        score += 0.15
    if tags.formality:
        score += 0.15
    if tags.material:
        score += 0.10
    if tags.season:
        score += 0.05
    if tags.style:
        score += 0.05
    if tags.colors:
        score += 0.05
    return round(score, 2)


_CONFIDENCE_FIELDS = {"type", "primary_color", "pattern", "material", "formality"}


def compute_confidence_from_logprobs(logprobs_content: list[dict] | None) -> float | None:
    if not logprobs_content:
        return None

    field_probs: dict[str, list[float]] = {}
    current_key = None
    expect_value = False

    for entry in logprobs_content:
        token = entry.get("token", "")
        logprob = entry.get("logprob", 0)
        prob = math.exp(logprob)
        stripped = token.strip().strip('"').strip("'")

        if stripped in _CONFIDENCE_FIELDS:
            current_key = stripped
            expect_value = False
            continue

        if current_key and ":" in token:
            expect_value = True
            continue

        if expect_value and current_key and stripped and stripped not in ("{", "[", ",", "}", "]"):
            if stripped == "null":
                current_key = None
                expect_value = False
                continue
            if current_key not in field_probs:
                field_probs[current_key] = []
            field_probs[current_key].append(prob)
            current_key = None
            expect_value = False

    if not field_probs:
        return None

    weights = {
        "type": 0.30,
        "primary_color": 0.25,
        "pattern": 0.15,
        "material": 0.15,
        "formality": 0.15,
    }
    total_weight = 0.0
    weighted_sum = 0.0

    for field, probs in field_probs.items():
        w = weights.get(field, 0.1)
        weighted_sum += w * min(probs)
        total_weight += w

    if total_weight == 0:
        return None

    return round(weighted_sum / total_weight, 2)


class AIEndpointConfig:
    """Configuration for an AI endpoint."""

    def __init__(
        self,
        url: str,
        vision_model: str = "moondream",
        text_model: str = "phi3:mini",
        name: str = "default",
        enabled: bool = True,
    ):
        self.url = url
        self.vision_model = vision_model
        self.text_model = text_model
        self.name = name
        self.enabled = enabled


class AIService:
    """Service for AI-powered image analysis and text generation."""

    def __init__(self, endpoints: list[dict] | None = None):
        """
        Initialize AI service with optional custom endpoints.

        Args:
            endpoints: List of endpoint configs from user preferences.
                      If None or empty, uses default from settings.

        Raises:
            AIDisabledError: backstop when internal AI is disabled; call sites
                should guard with require_internal_ai() first.
        """
        self.settings = get_settings()
        if not self.settings.ai_enabled:
            raise AIDisabledError("Internal AI is disabled; defer to an external agent.")
        self.timeout = self.settings.ai_timeout
        self.api_key = self.settings.ai_api_key

        # Build endpoint list
        self._endpoints: list[AIEndpointConfig] = []

        if endpoints:
            for ep in endpoints:
                if ep.get("enabled", True):
                    self._endpoints.append(
                        AIEndpointConfig(
                            url=ep["url"],
                            vision_model=ep.get("vision_model", "moondream"),
                            text_model=ep.get("text_model", "phi3:mini"),
                            name=ep.get("name", "custom"),
                            enabled=True,
                        )
                    )

        # Always add default endpoint as fallback (even if user has custom endpoints)
        # This ensures we can fall back to in-house Ollama if user endpoints are unreachable
        self._endpoints.append(
            AIEndpointConfig(
                url=self.settings.ai_base_url,
                vision_model=self.settings.ai_vision_model,
                text_model=self.settings.ai_text_model,
                name="default",
            )
        )

        # Legacy properties for backwards compatibility
        self.base_url = self._endpoints[0].url
        self.vision_model = self._endpoints[0].vision_model
        self.text_model = self._endpoints[0].text_model

    def _get_headers(self) -> dict:
        """Get headers for AI API requests, including auth if configured."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _preprocess_image(self, image_path: str | Path) -> str:
        """
        Preprocess image for AI analysis.
        Returns base64-encoded JPEG string.
        """
        with Image.open(image_path) as img:
            # Convert to RGB if necessary
            if img.mode != "RGB":
                img = img.convert("RGB")

            # Auto-orient based on EXIF
            img = ImageOps.exif_transpose(img)

            # Resize to max 512x512 for faster AI processing
            max_size = 512
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Convert to JPEG bytes
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=85)
            buffer.seek(0)

            return base64.b64encode(buffer.read()).decode("utf-8")

    def _parse_tags_from_response(self, response_text: str) -> ClothingTags:
        def extract_json(text: str) -> dict | None:
            try:
                return json.loads(text.strip())
            except json.JSONDecodeError:
                pass

            json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
            if json_match:
                try:
                    return json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass

            start_idx = text.find("{")
            if start_idx != -1:
                brace_count = 0
                for i, char in enumerate(text[start_idx:], start_idx):
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            json_str = text[start_idx : i + 1]
                            try:
                                return json.loads(json_str)
                            except json.JSONDecodeError:
                                break
            return None

        def validate_value(value: str | None, valid_set: set) -> str | None:
            if value is None:
                return None
            value_lower = value.lower().strip()
            if value_lower in valid_set:
                return value_lower
            return None

        def validate_colors(values: object) -> list[str]:
            if not isinstance(values, list):
                return []
            normalized = (normalize_color(v) for v in values if isinstance(v, str))
            return list(dict.fromkeys(c for c in normalized if c))

        def validate_list(values: list, valid_set: set) -> list:
            if not values:
                return []
            return [v.lower().strip() for v in values if v and v.lower().strip() in valid_set]

        data = extract_json(response_text)
        if not data:
            logger.warning("Could not parse JSON from AI response")
            return ClothingTags(raw_response=response_text)

        if isinstance(data, list):
            data = data[0] if data and isinstance(data[0], dict) else {}

        tags = ClothingTags()
        tags.raw_response = response_text

        raw_type = data.get("type")
        item_type = validate_value(raw_type, VALID_TYPES)
        if item_type:
            tags.type = item_type
        else:
            tags.type = "unknown"
            if isinstance(raw_type, str) and raw_type.strip():
                tags.unrecognized_type = raw_type.strip().lower()[:50]
                logger.warning("AI returned unsupported item type")

        tags.subtype = data.get("subtype") if data.get("subtype") else None
        raw_primary_color = data.get("primary_color")
        if isinstance(raw_primary_color, str):
            tags.primary_color = normalize_color(raw_primary_color)
        tags.colors = validate_colors(data.get("colors"))
        tags.pattern = validate_value(data.get("pattern"), VALID_PATTERNS)
        tags.material = validate_value(data.get("material"), VALID_MATERIALS)
        tags.formality = validate_value(data.get("formality"), VALID_FORMALITY)
        tags.style = validate_list(data.get("style", []), VALID_STYLES)
        tags.season = validate_list(data.get("season", []), VALID_SEASONS)
        tags.fit = validate_value(data.get("fit"), VALID_FIT)
        tags.confidence = compute_tag_completeness(tags)

        logger.info(
            f"Parsed tags: type={tags.type}, color={tags.primary_color}, pattern={tags.pattern}"
        )
        return tags

    async def _call_with_fallback(
        self,
        messages: list,
        task_name: str,
        use_vision_model: bool = True,
        request_logprobs: bool = False,
    ) -> tuple[str | None, Exception | None, list | None]:
        try:
            result = await CompletionGateway().complete(
                messages,
                endpoints=self._endpoints,
                settings=self.settings,
                timeout=self.timeout,
                headers=self._get_headers(),
                operation=task_name,
                use_vision_model=use_vision_model,
                request_logprobs=request_logprobs,
                backoff=True,
            )
            return result.content, None, result.logprobs_content
        except CompletionUnavailableError:
            return None, None, None
        except (RuntimeError, httpx.HTTPError, ValueError) as error:
            return None, error, None

    async def analyze_image(self, image_path: str | Path, *, locale: str) -> ClothingTags:
        # PIL preprocessing is CPU-bound and synchronous; run off the event loop so
        # concurrent tagging jobs don't stall each other's in-flight HTTP reads.
        image_base64 = await asyncio.to_thread(self._preprocess_image, image_path)

        # System/user separation for injection protection
        messages_tags = [
            {"role": "system", "content": TAGGING_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                    },
                ],
            },
        ]

        messages_desc = [
            {
                "role": "system",
                "content": DESCRIPTION_PROMPT.format(
                    language=DESCRIPTION_LANGUAGES.get(
                        locale, DESCRIPTION_LANGUAGES[DEFAULT_LOCALE]
                    )
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"},
                    },
                ],
            },
        ]

        tags = ClothingTags()

        # First pass: structured tags with logprobs for real confidence
        tags_content, tags_error, logprobs_content = await self._call_with_fallback(
            messages_tags, "tags", request_logprobs=True
        )
        if tags_content:
            tags = self._parse_tags_from_response(tags_content)
            logprobs_confidence = compute_confidence_from_logprobs(logprobs_content)
            if logprobs_confidence is not None:
                tags.logprobs_confidence = logprobs_confidence

        # Second pass: human-readable description
        description, description_error, _ = await self._call_with_fallback(
            messages_desc, "description"
        )
        if description:
            description = description.strip()
            for opening, closing in DESCRIPTION_QUOTES:
                if description.startswith(opening) and description.endswith(closing):
                    inner = description[len(opening) : -len(closing)]
                    # A mark inside means the outer two belong to separate quoted spans
                    # (a quoted brand at the start, a quoted colour at the end).
                    if opening not in inner and closing not in inner:
                        description = inner.strip()
                    break
            tags.description = description

        # A partial answer (an unsupported type with its colours, or only a description) is
        # still worth saving, so this fails only when neither pass produced anything usable.
        # Unparseable tag text counts as nothing, because saving it would store a blank item.
        if not tags.has_content() and not description:
            if tags_error is not None:
                # A rerun can still produce the description, so only a cutoff on both passes
                # ends the job without one.
                if repeats_identically(tags_error) and not repeats_identically(description_error):
                    tags_error.retryable = True
                raise tags_error
            if tags_content:
                reason = description_error or "empty description reply"
                raise RuntimeError(
                    f"AI returned no usable tags and no description: {reason}"
                ) from description_error
            raise description_error or RuntimeError("AI returned nothing usable")

        return tags

    async def check_health(self) -> dict:
        """Check health of all configured AI endpoints."""
        endpoints_health = []

        for endpoint in self._endpoints:
            try:
                async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
                    # Try OpenAI-compatible /v1/models endpoint first
                    response = await client.get(
                        f"{endpoint.url}/models", headers=self._get_headers()
                    )
                    if response.status_code == 200:
                        data = response.json()
                        # OpenAI format: {"data": [{"id": "model-name", ...}]}
                        models = data.get("data", [])
                        model_names = [m.get("id", "") for m in models]
                        endpoints_health.append(
                            {
                                "name": endpoint.name,
                                "url": endpoint.url,
                                "status": "healthy",
                                "vision_model": endpoint.vision_model,
                                "text_model": endpoint.text_model,
                                "available_models": model_names,
                            }
                        )
                        continue

                    # Fallback: Try Ollama-specific endpoint
                    response = await client.get(endpoint.url.replace("/v1", "/api/tags"))
                    if response.status_code == 200:
                        models = response.json().get("models", [])
                        model_names = [m.get("name", "") for m in models]
                        endpoints_health.append(
                            {
                                "name": endpoint.name,
                                "url": endpoint.url,
                                "status": "healthy",
                                "vision_model": endpoint.vision_model,
                                "text_model": endpoint.text_model,
                                "available_models": model_names,
                            }
                        )
                    else:
                        endpoints_health.append(
                            {
                                "name": endpoint.name,
                                "url": endpoint.url,
                                "status": "unhealthy",
                                "error": f"HTTP {response.status_code}",
                            }
                        )
            except Exception as e:
                endpoints_health.append(
                    {
                        "name": endpoint.name,
                        "url": endpoint.url,
                        "status": "unhealthy",
                        "error": str(e),
                    }
                )

        # Overall status is healthy if at least one endpoint is healthy
        any_healthy = any(ep["status"] == "healthy" for ep in endpoints_health)
        return {
            "status": "healthy" if any_healthy else "unhealthy",
            "endpoints": endpoints_health,
        }

    async def generate_text(
        self,
        prompt: str,
        system_prompt: str | None = None,
        return_metadata: bool = False,
        locale: str | None = None,
    ) -> str | TextGenerationResult:
        if locale is not None:
            language = DESCRIPTION_LANGUAGES.get(locale, DESCRIPTION_LANGUAGES[DEFAULT_LOCALE])
            instruction = (
                f"Write all user-facing prose, including outfit titles, explanations, "
                f"highlights and styling tips, in {language}. Preserve JSON keys, "
                "numeric item references and canonical enum values exactly."
            )
            if locale == "zh-CN":
                instruction += (
                    " 所有面向用户的标题、搭配理由、亮点和建议必须使用简体中文，"
                    "不要输出英文标题或英文说明。JSON字段名、数字编号和枚举值保持原样。"
                )
            system_prompt = f"{system_prompt}\n{instruction}" if system_prompt else instruction
            # Keep this after the long English template as well, so its example
            # prose does not override the user's selected output language.
            prompt = f"{prompt}\n\n{instruction}"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        result = await CompletionGateway().complete(
            messages,
            endpoints=self._endpoints,
            settings=self.settings,
            timeout=self.timeout,
            headers=self._get_headers(),
            operation="text",
            temperature=0.4,
        )
        if return_metadata:
            return TextGenerationResult(
                content=result.content,
                model=result.model,
                endpoint=result.endpoint,
                usage=result.usage,
                gateway_version=GATEWAY_VERSION,
                prompt_version="text-v1",
                prompt_fingerprint=result.prompt_fingerprint,
            )
        return result.content


class AIDisabledError(RuntimeError):
    """Raised when an internal AI client is requested while that capability is off."""


def require_internal_ai(capability: Literal["vision", "text"]) -> None:
    """Raise AIDisabledError if the given internal-AI capability is disabled.

    Call before constructing AIService directly so deferred work never builds a
    client or reaches a provider.
    """
    settings = get_settings()
    enabled = (
        settings.effective_ai_vision_enabled
        if capability == "vision"
        else settings.effective_ai_text_enabled
    )
    if not enabled:
        raise AIDisabledError(
            f"Internal AI {capability} is disabled "
            f"(AI_INTERNAL_ENABLED / AI_{capability.upper()}_ENABLED=false). "
            "Defer this work to an external agent."
        )


# Singleton instance
_ai_service: AIService | None = None


def get_ai_service() -> AIService:
    """Return the shared AIService, or raise AIDisabledError if internal AI is off."""
    if not get_settings().ai_enabled:
        raise AIDisabledError("Internal AI is disabled; defer to an external agent.")
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
