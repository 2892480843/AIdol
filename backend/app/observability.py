"""Correlation and metadata-only OpenTelemetry instrumentation.

Request/task identifiers belong on logs and traces, never metric labels. Upstream
content and exception messages are deliberately excluded from this module.
"""

import logging
import re
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from time import perf_counter
from uuid import uuid4

from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.trace import Status, StatusCode
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import Settings

logger = logging.getLogger(__name__)
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)
_task_id: ContextVar[str | None] = ContextVar("task_id", default=None)
_valid_id = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
_tracer = trace.get_tracer("wardrowbe")
_meter = metrics.get_meter("wardrowbe")
_providers: tuple[TracerProvider, MeterProvider] | None = None
_configuration: tuple | None = None
_instruments: dict = {}


def get_request_id() -> str | None:
    return _request_id.get()


def get_task_id() -> str | None:
    return _task_id.get()


@contextmanager
def task_context(task_id: str, *, request_id: str | None = None) -> Iterator[None]:
    """Bind a durable task and optionally its originating request across awaits."""
    task_token = _task_id.set(str(task_id))
    request_token = _request_id.set(request_id) if request_id is not None else None
    try:
        yield
    finally:
        if request_token is not None:
            _request_id.reset(request_token)
        _task_id.reset(task_token)


def correlation_fields() -> dict[str, str]:
    fields = {}
    if get_request_id():
        fields["request_id"] = get_request_id()
    if get_task_id():
        fields["task_id"] = get_task_id()
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        fields["trace_id"] = f"{context.trace_id:032x}"
        fields["span_id"] = f"{context.span_id:016x}"
    return fields


def _reset_instruments() -> None:
    _instruments.clear()


def configure_observability(settings: Settings) -> None:
    """Initialize once per process. OTLP export is opt-in via a collector URL."""
    global _tracer, _meter, _providers, _configuration
    configuration = (
        settings.otel_enabled,
        settings.otel_service_name,
        settings.otel_exporter_otlp_endpoint,
        settings.otel_export_interval_ms,
        settings.otel_export_timeout_seconds,
    )
    if _configuration == configuration:
        return
    shutdown_observability()
    _configuration = configuration
    if not settings.otel_enabled:
        _tracer = trace.NoOpTracerProvider().get_tracer("wardrowbe")
        _meter = metrics.NoOpMeterProvider().get_meter("wardrowbe")
        return
    resource = Resource.create({"service.name": settings.otel_service_name})
    tracer_provider = TracerProvider(resource=resource)
    readers = []
    if settings.otel_exporter_otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        endpoint = settings.otel_exporter_otlp_endpoint.rstrip("/")
        timeout = settings.otel_export_timeout_seconds
        tracer_provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{endpoint}/v1/traces", timeout=timeout))
        )
        readers.append(
            PeriodicExportingMetricReader(
                OTLPMetricExporter(endpoint=f"{endpoint}/v1/metrics", timeout=timeout),
                export_interval_millis=settings.otel_export_interval_ms,
                export_timeout_millis=timeout * 1000,
            )
        )
    meter_provider = MeterProvider(resource=resource, metric_readers=readers)
    _providers = tracer_provider, meter_provider
    _tracer = tracer_provider.get_tracer("wardrowbe")
    _meter = meter_provider.get_meter("wardrowbe")
    _reset_instruments()


def shutdown_observability() -> None:
    global _providers, _configuration, _tracer, _meter
    if _providers:
        for provider in _providers:
            provider.shutdown()
    _providers = None
    _configuration = None
    _tracer = trace.NoOpTracerProvider().get_tracer("wardrowbe")
    _meter = metrics.NoOpMeterProvider().get_meter("wardrowbe")
    _reset_instruments()


def _instrument(name: str, kind: str, unit: str = ""):
    if name not in _instruments:
        _instruments[name] = getattr(_meter, f"create_{kind}")(name, unit=unit)
    return _instruments[name]


def _safe_label(value: str) -> str:
    # Labels are identifiers, not arbitrary user/provider text.
    return re.sub(r"[^A-Za-z0-9._:/-]", "_", str(value))[:128]


def safe_usage(data: object) -> dict[str, int]:
    if not isinstance(data, dict):
        return {}
    return {
        key: value
        for key in ("prompt_tokens", "completion_tokens", "total_tokens")
        if isinstance((value := data.get(key)), int) and not isinstance(value, bool) and value >= 0
    }


@dataclass
class ModelCall:
    model: str
    endpoint: str
    operation: str
    status: str = "error"
    used_model: str | None = None
    usage: dict[str, int] = field(default_factory=dict)
    http_status: int | None = None

    def finish(self, status: str, *, data: dict | None = None, http_status: int | None = None):
        self.status = status
        self.http_status = http_status
        if data:
            self.used_model = _safe_label(data.get("model") or self.model)
            self.usage = safe_usage(data.get("usage"))


@contextmanager
def model_call(model: str, endpoint: str, operation: str) -> Iterator[ModelCall]:
    call = ModelCall(_safe_label(model), _safe_label(endpoint), _safe_label(operation))
    attributes = {
        "gen_ai.request.model": call.model,
        "gen_ai.operation.name": call.operation,
        "wardrowbe.ai.endpoint": call.endpoint,
        **{
            f"wardrowbe.{k}": v
            for k, v in correlation_fields().items()
            if k in ("request_id", "task_id")
        },
    }
    started = perf_counter()
    with _tracer.start_as_current_span(
        "ai.completion",
        attributes=attributes,
        record_exception=False,
        set_status_on_exception=False,
    ) as span:
        try:
            yield call
        except BaseException as exc:
            if call.status == "error":
                call.status = (
                    "cancelled"
                    if isinstance(exc, BaseException) and not isinstance(exc, Exception)
                    else "error"
                )
            raise
        finally:
            duration = perf_counter() - started
            span.set_attribute("wardrowbe.ai.status", call.status)
            span.set_attribute("gen_ai.response.model", call.used_model or call.model)
            if call.http_status is not None:
                span.set_attribute("http.response.status_code", call.http_status)
            for key, attr in (
                ("prompt_tokens", "input_tokens"),
                ("completion_tokens", "output_tokens"),
            ):
                if key in call.usage:
                    span.set_attribute(f"gen_ai.usage.{attr}", call.usage[key])
            span.set_status(Status(StatusCode.OK if call.status == "success" else StatusCode.ERROR))
            labels = {
                "model": call.model,
                "endpoint": call.endpoint,
                "operation": call.operation,
                "status": call.status,
            }
            _instrument("wardrowbe.ai.calls", "counter", "{call}").add(1, labels)
            _instrument("wardrowbe.ai.duration", "histogram", "s").record(duration, labels)
            for key in ("prompt_tokens", "completion_tokens"):
                if key in call.usage:
                    _instrument("wardrowbe.ai.tokens", "counter", "{token}").add(
                        call.usage[key], {**labels, "token_type": key}
                    )
            logger.info(
                "ai.completion",
                extra={
                    **correlation_fields(),
                    "model": call.used_model or call.model,
                    "requested_model": call.model,
                    "endpoint": call.endpoint,
                    "operation": call.operation,
                    "status": call.status,
                    "duration_ms": round(duration * 1000, 2),
                    "http_status": call.http_status,
                    "usage": call.usage,
                },
            )


class RequestCorrelationMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        supplied = headers.get(b"x-request-id", b"").decode("ascii", errors="replace")
        request_id = supplied if _valid_id.fullmatch(supplied) else uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        token = _request_id.set(request_id)
        started = perf_counter()
        status_code = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                response_headers = [
                    (k, v) for k, v in message.get("headers", []) if k.lower() != b"x-request-id"
                ]
                message["headers"] = response_headers + [
                    (b"x-request-id", request_id.encode("ascii"))
                ]
            await send(message)

        try:
            with _tracer.start_as_current_span(
                "http.request",
                attributes={
                    "http.request.method": scope["method"],
                    "wardrowbe.request_id": request_id,
                },
                record_exception=False,
                set_status_on_exception=False,
            ) as span:
                try:
                    await self.app(scope, receive, send_with_id)
                finally:
                    route = getattr(scope.get("route"), "path", "unmatched")
                    span.set_attribute("http.route", route)
                    span.set_attribute("http.response.status_code", status_code)
                    if status_code >= 500:
                        span.set_status(Status(StatusCode.ERROR))
                    _instrument("wardrowbe.http.requests", "counter", "{request}").add(
                        1, {"method": scope["method"], "route": route, "status": status_code}
                    )
                    logger.info(
                        "http.request",
                        extra={
                            **correlation_fields(),
                            "route": route,
                            "method": scope["method"],
                            "http_status": status_code,
                            "duration_ms": round((perf_counter() - started) * 1000, 2),
                        },
                    )
        finally:
            _request_id.reset(token)
