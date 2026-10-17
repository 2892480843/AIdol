import asyncio
import io
import json
import logging
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import ConsoleMetricExporter, InMemoryMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app import observability
from app.config import Settings
from app.logging_config import JsonFormatter, ProviderExceptionFilter
from app.services.ai_service import AIService


@pytest.fixture
def telemetry(monkeypatch):
    exporter = InMemorySpanExporter()
    tracer_provider = TracerProvider()
    tracer_provider.add_span_processor(SimpleSpanProcessor(exporter))
    reader = InMemoryMetricReader()
    meter_provider = MeterProvider(metric_readers=[reader])
    monkeypatch.setattr(observability, "_tracer", tracer_provider.get_tracer("test"))
    monkeypatch.setattr(observability, "_meter", meter_provider.get_meter("test"))
    observability._reset_instruments()
    yield exporter, reader
    observability._reset_instruments()
    tracer_provider.shutdown()
    meter_provider.shutdown()


@pytest.mark.asyncio
async def test_request_ids_are_returned_and_do_not_leak_between_concurrent_requests():
    app = FastAPI()
    app.add_middleware(observability.RequestCorrelationMiddleware)

    @app.get("/probe")
    async def probe():
        await asyncio.sleep(0)
        return {"request_id": observability.get_request_id()}

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as c:
        responses = await asyncio.gather(
            c.get("/probe", headers={"X-Request-ID": "request-a"}),
            c.get("/probe", headers={"X-Request-ID": "request-b"}),
            c.get("/probe", headers={"X-Request-ID": "bad id"}),
        )
    ids = [r.headers["X-Request-ID"] for r in responses]
    assert ids[:2] == ["request-a", "request-b"]
    assert ids[2] != "bad id"
    assert all(r.json()["request_id"] == rid for r, rid in zip(responses, ids, strict=True))
    assert observability.get_request_id() is None


def test_task_context_and_json_logs_restore_context_without_serializing_extra_secrets():
    with observability.task_context("task-a", request_id="request-a"):
        record = logging.LogRecord("app.test", logging.INFO, __file__, 1, "completed", (), None)
        record.api_key = "never-export-me"
        data = json.loads(JsonFormatter().format(record))
        assert data["task_id"] == "task-a"
        assert data["request_id"] == "request-a"
        assert "never-export-me" not in json.dumps(data)
    assert observability.get_request_id() is None
    assert observability.get_task_id() is None


def test_json_exception_log_omits_message_and_traceback_content():
    error = RuntimeError("private upstream response")
    record = logging.LogRecord(
        "app.test",
        logging.ERROR,
        __file__,
        1,
        "Failure: private upstream response",
        (),
        (RuntimeError, error, None),
    )
    formatted = JsonFormatter().format(record)
    assert "private upstream response" not in formatted
    assert json.loads(formatted)["error_type"] == "RuntimeError"


def test_arq_provider_failure_log_omits_provider_text_without_changing_exception():
    from app.services.model_gateway import _AIProviderResponseError

    error = _AIProviderResponseError("private provider details")
    record = logging.LogRecord(
        "arq.worker",
        logging.ERROR,
        __file__,
        1,
        "Job failed: %s",
        (error,),
        (_AIProviderResponseError, error, None),
    )
    assert ProviderExceptionFilter().filter(record)
    assert "private provider details" not in record.getMessage()
    assert record.exc_info is None
    assert str(error) == "private provider details"


@pytest.mark.asyncio
async def test_model_calls_emit_real_spans_metrics_and_safe_correlated_logs(telemetry, caplog):
    exporter, reader = telemetry
    response = httpx.Response(
        200,
        json={
            "model": "served-model",
            "choices": [{"message": {"content": "private reply"}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 5, "total_tokens": 17},
        },
        request=httpx.Request("POST", "https://provider.test/v1/chat/completions"),
    )
    with (
        observability.task_context("task-a", request_id="request-a"),
        patch("httpx.AsyncClient.post", return_value=response),
        caplog.at_level(logging.INFO, logger="app"),
    ):
        result = await AIService().generate_text("private prompt", return_metadata=True)
    spans = exporter.get_finished_spans()
    assert len(spans) == 1
    assert spans[0].attributes["gen_ai.response.model"] == "served-model"
    assert spans[0].attributes["wardrowbe.request_id"] == "request-a"
    assert spans[0].attributes["wardrowbe.task_id"] == "task-a"
    assert spans[0].attributes["gen_ai.usage.input_tokens"] == 12
    metric_names = {
        m.name
        for resource in reader.get_metrics_data().resource_metrics
        for scope in resource.scope_metrics
        for m in scope.metrics
    }
    assert {"wardrowbe.ai.calls", "wardrowbe.ai.duration", "wardrowbe.ai.tokens"} <= metric_names
    assert result.usage["total_tokens"] == 17
    assert result.prompt_version and result.gateway_version and result.prompt_fingerprint
    assert "private prompt" not in caplog.text
    assert "private reply" not in caplog.text
    completion = next(r for r in caplog.records if r.msg == "ai.completion")
    assert completion.task_id == "task-a"
    assert completion.request_id == "request-a"
    assert completion.duration_ms >= 0


@pytest.mark.asyncio
async def test_provider_error_is_recorded_without_error_body_or_exception_event(telemetry, caplog):
    exporter, _ = telemetry
    response = httpx.Response(
        200,
        json={"error": {"message": "secret upstream detail"}},
        request=httpx.Request("POST", "https://provider.test/completions"),
    )
    service = AIService()
    service.settings = service.settings.model_copy(update={"ai_max_retries": 1})
    with patch("httpx.AsyncClient.post", return_value=response), caplog.at_level(logging.INFO):
        with pytest.raises(RuntimeError):
            await service.generate_text("private prompt")
    assert "secret upstream detail" not in caplog.text
    span = exporter.get_finished_spans()[0]
    assert span.attributes["wardrowbe.ai.status"] == "provider_error"
    assert not span.events


@pytest.mark.asyncio
async def test_gateway_rotates_comma_separated_models_and_capability_retry_is_free():
    service = AIService()
    service._endpoints[0].text_model = "first-model, second-model"
    service.settings = service.settings.model_copy(update={"ai_max_retries": 1})
    responses = [
        httpx.Response(
            400, json={"error": "invalid model"}, request=httpx.Request("POST", "http://test")
        ),
        httpx.Response(
            400,
            json={"error": "unsupported reasoning_effort"},
            request=httpx.Request("POST", "http://test"),
        ),
        httpx.Response(
            200,
            json={"choices": [{"message": {"content": "ok"}}]},
            request=httpx.Request("POST", "http://test"),
        ),
    ]
    with patch("httpx.AsyncClient.post", side_effect=responses) as post:
        assert await service.generate_text("hello") == "ok"
    assert [call.kwargs["json"]["model"] for call in post.call_args_list] == [
        "first-model",
        "second-model",
        "second-model",
    ]
    assert "reasoning_effort" not in post.call_args_list[-1].kwargs["json"]


@pytest.mark.asyncio
async def test_unhandled_failure_keeps_request_id_and_hides_exception_message(caplog):
    from app.main import generic_exception_handler

    app = FastAPI()
    app.add_middleware(observability.RequestCorrelationMiddleware)
    app.add_exception_handler(Exception, generic_exception_handler)

    @app.get("/failure")
    async def failure():
        raise RuntimeError("private provider detail")

    with caplog.at_level(logging.ERROR, logger="app"):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app, raise_app_exceptions=False), base_url="http://test"
        ) as client:
            response = await client.get("/failure", headers={"X-Request-ID": "failure-request"})
    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "failure-request"
    assert "private provider detail" not in response.text + caplog.text
    assert observability.get_request_id() is None


def test_otlp_export_is_optional_and_configures_traces_and_metrics():
    captured = {}

    def traces(**kwargs):
        captured["traces"] = kwargs
        return InMemorySpanExporter()

    def metric_exporter(**kwargs):
        captured["metrics"] = kwargs
        return ConsoleMetricExporter(out=io.StringIO())

    with (
        patch(
            "opentelemetry.exporter.otlp.proto.http.trace_exporter.OTLPSpanExporter",
            side_effect=traces,
        ),
        patch(
            "opentelemetry.exporter.otlp.proto.http.metric_exporter.OTLPMetricExporter",
            side_effect=metric_exporter,
        ),
    ):
        try:
            observability.configure_observability(Settings(otel_exporter_otlp_endpoint=None))
            assert captured == {}
            observability.configure_observability(
                Settings(
                    otel_exporter_otlp_endpoint="http://collector.test:4318/",
                    otel_service_name="quality-worker",
                )
            )
            assert captured["traces"]["endpoint"] == "http://collector.test:4318/v1/traces"
            assert captured["metrics"]["endpoint"] == "http://collector.test:4318/v1/metrics"
            assert (
                observability._providers[0].resource.attributes["service.name"] == "quality-worker"
            )
        finally:
            observability.shutdown_observability()


@pytest.mark.asyncio
async def test_tagging_worker_logs_only_health_summary(monkeypatch, caplog):
    from app.workers import worker

    ai = AsyncMock()
    ai.check_health.return_value = {
        "status": "unhealthy",
        "endpoints": [{"url": "http://private-endpoint", "error": "private-provider-error"}],
    }
    monkeypatch.setattr(worker, "AIService", lambda: ai)
    monkeypatch.setattr(worker, "configure_logging", lambda settings: None)
    monkeypatch.setattr(worker, "init_db", AsyncMock())
    monkeypatch.setattr(worker, "recover_stale_processing_items", AsyncMock())
    monkeypatch.setattr(worker, "get_settings", lambda: Settings(ai_internal_enabled=True))
    with caplog.at_level(logging.INFO, logger="app"):
        await worker.startup({})
    assert "private-endpoint" not in caplog.text
    assert "private-provider-error" not in caplog.text
    assert "unhealthy" in caplog.text


@pytest.mark.asyncio
async def test_cors_allows_correlated_idempotent_task_submissions():
    from app.main import app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app), base_url="http://test"
    ) as client:
        response = await client.options(
            "/api/v1/tasks/recommendations",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization,Content-Type,Idempotency-Key,X-Request-ID",
            },
        )
    assert response.status_code == 200
    assert "idempotency-key" in response.headers["access-control-allow-headers"].lower()
