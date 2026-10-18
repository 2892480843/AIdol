"""One explicitly approved provider diagnosis; never retries or changes task rows."""

import base64
import json
import subprocess
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent
FIXTURE = DIRECTORY / "person-fixture.png"

CONTAINER_PROGRAM = r'''
import asyncio
import base64
import json
import re
import sys
from datetime import UTC, datetime
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from sqlalchemy import select

from app.config import get_settings
from app.database import async_session_maker
from app.models.item import ClothingItem, ItemStatus
from app.models.tryon import TryOnTask
from app.services.tryon import EDIT_PROMPT, TOP_TYPES, TryOnService, normalize_person

TASK_ID = UUID("63458b3e-93f0-4208-9c77-ed3847941c83")
PARAMETERS = {
    "model", "prompt", "image", "images", "image_url", "size", "response_format",
    "sequential_image_generation", "stream", "watermark", "n", "output_format",
}


def safe_message(value, settings):
    text = str(value)
    for private in (
        settings.ai_api_key, settings.ai_base_url,
        urlsplit(settings.ai_base_url).netloc, EDIT_PROMPT,
    ):
        if private:
            text = text.replace(private, "[redacted]")
    text = re.sub(r"data:image/[^\s\"']+", "[image-redacted]", text, flags=re.I)
    text = re.sub(r"https?://[^\s\"'<>]+", "[url-redacted]", text, flags=re.I)
    text = re.sub(r"(?i)(bearer\s+)[^\s,;]+", r"\1[redacted]", text)
    text = re.sub(
        r"(?i)(api[_-]?key|token|secret|password|authorization)([\s:=]+)[^\s,;]+",
        r"\1\2[redacted]", text,
    )
    text = re.sub(r"(?i)request[ _-]?id\s*[:=]\s*[A-Za-z0-9_-]+", "request_id=[redacted]", text)
    text = re.sub(r"[A-Za-z0-9_+/=-]{28,}", "[long-value-redacted]", text)
    return " ".join(text.split())[:300]


def safe_code(value, settings):
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.-]{0,79}", value):
        return None
    if settings.ai_api_key and settings.ai_api_key in value:
        return None
    prefixes = (
        "invalid", "missing", "unsupported", "access", "authentication", "authorization",
        "insufficient", "unauthorized", "forbidden", "notfound", "rate", "quota", "server",
        "internal", "content", "image", "parameter", "resource", "bad", "generation",
        "request", "service", "system", "model", "sensitive", "limit",
    )
    return value if value.lower().startswith(prefixes) else None


class DiagnosticTransport(httpx.AsyncBaseTransport):
    def __init__(self, settings):
        self.delegate = httpx.AsyncHTTPTransport(retries=0)
        self.settings = settings
        self.calls = 0
        self.diagnostic = {}

    async def handle_async_request(self, request):
        self.calls += 1
        if self.calls != 1 or request.method != "POST" or not request.url.path.endswith("/images/generations"):
            raise RuntimeError("A second or different request is forbidden")
        response = await self.delegate.handle_async_request(request)
        self.diagnostic = {"http_status": response.status_code}
        if response.status_code == 200:
            return response
        raw = bytearray()
        async for chunk in response.aiter_bytes():
            remaining = 65536 - len(raw)
            raw.extend(chunk[:remaining])
            if len(chunk) >= remaining:
                self.diagnostic["error_body_truncated"] = True
                break
        await response.aclose()
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeError):
            payload = {}
        if isinstance(payload, dict):
            error = payload.get("error")
            fields = error if isinstance(error, dict) else payload
            self.diagnostic["error_code"] = safe_code(fields.get("code"), self.settings)
            parameter = fields.get("param")
            self.diagnostic["error_param"] = parameter if parameter in PARAMETERS else None
            message = fields.get("message") or fields.get("msg") or fields.get("detail")
            if isinstance(message, str):
                self.diagnostic["sanitized_message"] = safe_message(message, self.settings)
        raw.clear()
        return httpx.Response(response.status_code, json={"error": "diagnostic_rejection"})

    async def aclose(self):
        await self.delegate.aclose()


async def main():
    settings = get_settings()
    photo = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
    service = TryOnService(settings=settings)
    person = await asyncio.to_thread(normalize_person, photo, "image/png")
    async with async_session_maker() as db:
        item = (
            await db.execute(
                select(ClothingItem)
                .join(TryOnTask, TryOnTask.item_id == ClothingItem.id)
                .where(
                    TryOnTask.id == TASK_ID,
                    ClothingItem.user_id == TryOnTask.user_id,
                    ClothingItem.status == ItemStatus.ready,
                    ClothingItem.is_archived.is_(False),
                    ClothingItem.needs_wash.is_(False),
                    ClothingItem.type.in_(TOP_TYPES),
                )
            )
        ).scalar_one_or_none()
        if item is None:
            raise RuntimeError("Original task's eligible owned top is unavailable")
        garment = await asyncio.to_thread(service._garment, item)
    transport = DiagnosticTransport(settings)
    service.transport = transport
    report = {
        "kind": "one_approved_original_fixture_provider_diagnostic",
        "reference_failed_ui_task_id": str(TASK_ID),
        "model": settings.tryon_model,
        "input_person": "original fictional adult fixture",
        "input_garment": "existing owned QA top from referenced task",
        "ui_task_created_or_updated": False,
        "automatic_retries": 0,
        "timestamp_utc": datetime.now(UTC).isoformat(),
    }
    try:
        async with asyncio.timeout(settings.tryon_timeout_seconds):
            result = await service.generate(person, garment)
        report["status"] = "succeeded_direct_diagnostic_not_ui_task"
        report["result_b64_for_parent_process_only"] = base64.b64encode(result).decode("ascii")
    except Exception as error:
        report["status"] = "failed"
        report["error_type"] = type(error).__name__
    report["network_post_count"] = transport.calls
    report["provider_diagnostic"] = transport.diagnostic
    print(json.dumps(report, ensure_ascii=False))


try:
    asyncio.run(main())
except Exception as error:
    print(json.dumps({"status": "diagnostic_setup_failed", "error_type": type(error).__name__}))
'''


def main():
    fixture = FIXTURE.read_bytes()
    if not 0 < len(fixture) <= 10 * 1024 * 1024:
        raise RuntimeError("Fixture is outside the approved input limit")
    process = subprocess.run(
        ["docker", "exec", "-i", "wardrobe-backend", "python", "-c", CONTAINER_PROGRAM],
        input=fixture,
        capture_output=True,
        timeout=130,
        check=False,
    )
    # Never echo child output or stderr: the only printable object is its filtered
    # JSON report, with any successful image extracted into a separate artifact.
    report = json.loads(process.stdout.decode("utf-8").strip().splitlines()[-1])
    encoded = report.pop("result_b64_for_parent_process_only", None)
    if encoded:
        result_path = DIRECTORY / "diagnostic-result.jpg"
        result_path.write_bytes(base64.b64decode(encoded, validate=True))
        report["result_artifact"] = result_path.name
    (DIRECTORY / "provider-diagnostic.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
