import json
import logging
from datetime import UTC, datetime

import httpx

from app.config import Settings
from app.observability import configure_observability, correlation_fields

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


class ProviderExceptionFilter(logging.Filter):
    """arq owns its handlers, so sanitize provider failures before they reach them."""

    def filter(self, record: logging.LogRecord) -> bool:
        candidates = [record.exc_info[1]] if record.exc_info else []
        args = record.args.values() if isinstance(record.args, dict) else (record.args or ())
        candidates.extend(value for value in args if isinstance(value, BaseException))
        for original in candidates:
            error = original
            seen = set()
            while error is not None and id(error) not in seen:
                seen.add(id(error))
                if (
                    isinstance(error, httpx.HTTPError)
                    or type(error).__module__ == "app.services.model_gateway"
                ):
                    record.msg = "Worker job failed (error_type=%s)"
                    record.args = (type(original).__name__,)
                    record.error_type = type(original).__name__
                    record.exc_info, record.exc_text = None, None
                    return True
                error = error.__cause__ or error.__context__
        return True


class JsonFormatter(logging.Formatter):
    """Export an allowlist of operational fields, excluding arbitrary extras."""

    FIELDS = (
        "request_id",
        "task_id",
        "trace_id",
        "span_id",
        "model",
        "requested_model",
        "endpoint",
        "operation",
        "status",
        "duration_ms",
        "http_status",
        "usage",
        "route",
        "method",
        "error_type",
    )

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            **correlation_fields(),
        }
        for name in self.FIELDS:
            if hasattr(record, name):
                payload[name] = getattr(record, name)
        # Exception messages/tracebacks can contain provider bodies or credentials.
        if record.exc_info and record.exc_info[0]:
            payload["message"] = "exception"
            payload["error_type"] = record.exc_info[0].__name__
            payload["source"] = f"{record.filename}:{record.lineno}"
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(settings: Settings) -> None:
    configure_observability(settings)
    arq_logger = logging.getLogger("arq.worker")
    if not any(isinstance(f, ProviderExceptionFilter) for f in arq_logger.filters):
        arq_logger.addFilter(ProviderExceptionFilter())
    # The handler goes on "app" rather than root because arq's CLI gives its own
    # logger a handler without disabling propagation, so a root handler would print
    # every arq line twice and would also surface INFO chatter from httpx and friends.
    app_logger = logging.getLogger("app")
    app_logger.setLevel(settings.log_level)
    if not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        app_logger.addHandler(handler)
