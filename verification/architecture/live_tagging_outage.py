"""Real queue outage acceptance; operator controls this project's Redis only.

Run with /evidence mounted, PYTHONPATH=/app. The two marker files coordinate
the operator; no credentials or model responses are retained in the report.
"""

import asyncio
import io
import json
import re
import time
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from PIL import Image, ImageDraw

from app.database import async_session_maker
from app.models.item import ClothingItem
from app.models.tagging_outbox import TaggingOutbox

EVIDENCE = Path("/evidence")
report = {"started_at": datetime.now().isoformat(), "passed": False}
client = httpx.Client(base_url="http://frontend:3000/api/v1", timeout=30)


def save():
    (EVIDENCE / "live-tagging-outage.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    )


def request(method, path, expected=200, **kwargs):
    response = client.request(method, path, **kwargs)
    assert response.status_code == expected, f"{method} {path}: HTTP {response.status_code}"
    return response.json()


def wait_marker(name, seconds=120):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if (EVIDENCE / name).exists():
            return
        time.sleep(0.25)
    raise AssertionError(f"Operator marker not received: {name}")


async def audit(item_id, job_id=None, complete=False):
    async with async_session_maker() as db:
        item = await db.get(ClothingItem, UUID(item_id))
        job_id = job_id or item.ai_job_id
        event = await db.get(TaggingOutbox, job_id)
        assert event is not None and event.item_id == item.id
        assert item.ai_job_id == event.job_id
        if complete:
            assert event.completed_at is not None
            assert event.published_at is not None
            assert item.ai_processed and item.status.value == "ready"
        else:
            assert event.completed_at is None and event.published_at is None
            assert item.status.value == "processing"
        return {"item_id": str(item.id), "job_id": event.job_id,
                "published": event.published_at is not None,
                "completed": event.completed_at is not None}


async def main():
    email = f"queue-outage-{uuid4().hex[:10]}@example.com"
    owner = request("POST", "/auth/sync", json={"external_id": email, "email": email,
                                                "display_name": "队列恢复验收"})
    client.headers["Authorization"] = "Bearer " + owner["access_token"]
    request("PATCH", "/users/me", json={"locale": "zh-CN", "timezone": "Asia/Shanghai"})
    report["test_user_id"] = owner["id"]
    image = Image.new("RGB", (400, 400), "#eeeeee")
    draw = ImageDraw.Draw(image)
    draw.polygon([(140, 70), (70, 115), (90, 180), (120, 165), (120, 330),
                  (280, 330), (280, 165), (310, 180), (330, 115), (260, 70),
                  (235, 95), (165, 95)], fill="#159b68", outline="#126044", width=3)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    print(json.dumps({"event": "stop_redis_now"}), flush=True)
    wait_marker("redis-stopped.flag")
    start = time.monotonic()
    item = request("POST", "/items", expected=201, data={"name": "队列中断绿色样衣"},
                   files={"image": ("green-shirt.png", buf.getvalue(), "image/png")})
    report["upload_seconds_during_outage"] = round(time.monotonic() - start, 2)
    assert report["upload_seconds_during_outage"] < 10
    assert item["status"] == "processing"
    report["durable_before_recovery"] = await audit(item["id"])
    job_id = report["durable_before_recovery"]["job_id"]
    save()
    print(json.dumps({"event": "restart_redis_now", "upload_seconds": report["upload_seconds_during_outage"]}), flush=True)
    wait_marker("redis-restarted.flag")
    started = time.monotonic()
    while time.monotonic() - started < 240:
        current = request("GET", "/items/" + item["id"])
        if current["status"] == "ready" and current["ai_processed"]:
            break
        assert current["status"] != "error", "Tagging reached error status"
        await asyncio.sleep(1)
    else:
        raise AssertionError("Tagging did not recover within 240 seconds")
    assert current["type"] == "t-shirt" and current["primary_color"] == "green"
    assert re.search(r"[\u4e00-\u9fff]", current.get("ai_description") or "")
    image_response = client.get("http://frontend:3000" + current["image_url"])
    assert image_response.status_code == 200
    assert image_response.headers["content-type"].startswith("image/")
    report["after_recovery"] = await audit(item["id"], job_id, complete=True)
    report["recovery_seconds"] = round(time.monotonic() - started, 2)
    report["recognized_type"] = current["type"]
    report["recognized_color"] = current["primary_color"]
    report["chinese_description"] = True
    report["signed_s3_image"] = True
    report["passed"] = True
    save()
    print(json.dumps(report, ensure_ascii=False), flush=True)


try:
    asyncio.run(main())
except Exception as error:
    report["error"] = f"{type(error).__name__}: {error}"
    save()
    raise
