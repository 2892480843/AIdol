"""Live bulk-tagging cancellation acceptance; the operator controls Redis.

Run in a backend container with /evidence mounted and PYTHONPATH=/app. This
script creates synthetic data through HTTP and only reads PostgreSQL directly.
It never controls containers or retains tokens, images, or response bodies.
"""

import asyncio
import io
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import imagehash
from PIL import Image, ImageDraw
from sqlalchemy import select

from app.database import async_session_maker
from app.models.item import ClothingItem, ItemStatus
from app.models.tagging_outbox import TaggingOutbox

EVIDENCE = Path("/evidence")
STOPPED = "bulk-redis-stopped.flag"
RESTARTED = "bulk-redis-restarted.flag"


def timestamp():
    return datetime.now(UTC).isoformat()


def save(report):
    target = EVIDENCE / "live-bulk-cancel-outage.json"
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    temporary.replace(target)


async def request(client, method, path, expected=200, **kwargs):
    response = await client.request(method, path, **kwargs)
    assert response.status_code == expected, f"Unexpected HTTP status for {method} {path}"
    return response.json()


async def wait_marker(name, seconds=180):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if (EVIDENCE / name).exists():
            return
        await asyncio.sleep(0.25)
    raise AssertionError("Operator marker was not received before the deadline")


def synthetic_images():
    images = []
    for variant in range(2):
        image = Image.new("RGB", (400, 400), "#eeeeee")
        draw = ImageDraw.Draw(image)
        if variant == 0:
            draw.polygon(
                [
                    (140, 70),
                    (70, 115),
                    (90, 180),
                    (120, 165),
                    (120, 330),
                    (280, 330),
                    (280, 165),
                    (310, 180),
                    (330, 115),
                    (260, 70),
                    (235, 95),
                    (165, 95),
                ],
                fill="#159b68",
            )
        else:
            draw.polygon([(150, 35), (250, 35), (350, 365), (50, 365)], fill="#2444b5")
            draw.rectangle((180, 70, 220, 330), fill="#eeeeee")
            draw.ellipse((55, 50, 115, 110), fill="#f0ad22")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        images.append((str(imagehash.phash(image)), buffer.getvalue()))
    assert images[0][0] != images[1][0], "Synthetic images must have different pHashes"
    return [content for _, content in images]


async def audit(owner_id, item_ids, job_ids=None, *, pending=False):
    snapshots, generations = [], []
    async with async_session_maker() as db:
        for index, item_id in enumerate(item_ids):
            item = await db.get(ClothingItem, UUID(item_id))
            assert item is not None and str(item.user_id) == owner_id, "Item ownership changed"
            job_id = job_ids[index] if job_ids else item.ai_job_id
            assert job_id, "Missing durable tagging generation"
            event = await db.get(TaggingOutbox, job_id)
            assert event is not None and event.item_id == item.id, "Missing tagging intent"
            if pending:
                assert item.status == ItemStatus.processing and item.ai_job_id == job_id
                assert event.published_at is None and event.completed_at is None
            else:
                assert item.status == ItemStatus.ready and item.ai_job_id is None
                assert item.ai_started_at is None and item.processing_kind is None
            assert item.ai_processed is False, "Cancelled item was processed by AI"
            assert item.ai_completed_at is None and item.ai_raw_response is None
            assert item.type == "unknown" and item.primary_color is None
            assert item.ai_description is None and item.tagged_by is None
            events = (
                (
                    await db.execute(
                        select(TaggingOutbox.job_id).where(TaggingOutbox.item_id == item.id)
                    )
                )
                .scalars()
                .all()
            )
            assert events == [job_id], "A replacement tagging generation was created"
            generations.append(job_id)
            snapshots.append(
                {
                    "item_id": item_id,
                    "job_id": job_id,
                    "state": item.status.value,
                    "ai_processed": item.ai_processed,
                    "published_at": event.published_at.isoformat() if event.published_at else None,
                    "completed_at": event.completed_at.isoformat() if event.completed_at else None,
                }
            )
    return snapshots, generations


async def main(report):
    assert EVIDENCE.is_dir(), "The /evidence mount is required"
    assert not any((EVIDENCE / name).exists() for name in (STOPPED, RESTARTED)), (
        "Remove stale markers"
    )
    images = synthetic_images()
    async with httpx.AsyncClient(base_url="http://frontend:3000/api/v1", timeout=30) as client:
        email = f"bulk-cancel-outage-{uuid4().hex}@example.com"
        owner = await request(
            client,
            "POST",
            "/auth/sync",
            json={
                "external_id": email,
                "email": email,
                "display_name": "Bulk cancellation acceptance",
            },
        )
        owner_id = str(owner["id"])
        client.headers["Authorization"] = "Bearer " + owner.pop("access_token")
        report["owner_id"] = owner_id
        print(json.dumps({"event": "stop_redis_now", "at": timestamp()}), flush=True)
        await wait_marker(STOPPED)
        started = time.monotonic()
        upload = await request(
            client,
            "POST",
            "/items/bulk",
            expected=201,
            files=[
                ("images", ("shirt.png", images[0], "image/png")),
                ("images", ("dress.png", images[1], "image/png")),
            ],
        )
        report["upload_seconds"] = round(time.monotonic() - started, 2)
        assert upload["successful"] == 2 and upload["failed"] == 0
        assert len(upload["results"]) == 2 and all(row["success"] for row in upload["results"])
        item_ids = [str(row["item"]["id"]) for row in upload["results"]]
        assert len(set(item_ids)) == 2, "Bulk upload did not create two distinct items"
        report["pending"], job_ids = await audit(owner_id, item_ids, pending=True)
        started = time.monotonic()
        cancelled = await request(
            client, "POST", "/items/bulk/cancel-analysis", json={"item_ids": item_ids}
        )
        report["cancel_seconds"] = round(time.monotonic() - started, 2)
        assert cancelled["cancelled"] == 2 and not cancelled["errors"]
        report["cancelled"], _ = await audit(owner_id, item_ids, job_ids)
        report["state"] = "cancelled_while_redis_offline"
        save(report)
        print(json.dumps({"event": "restart_redis_now", "at": timestamp()}), flush=True)
        await wait_marker(RESTARTED)
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            after, _ = await audit(owner_id, item_ids, job_ids)
            if all(row["completed_at"] for row in after):
                break
            await asyncio.sleep(1)
        else:
            raise AssertionError("Cancelled tagging intents did not retire after Redis restarted")
        # Observe beyond another relay cycle so a delayed delivery cannot silently
        # overwrite a cancellation immediately after the first successful read.
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            after, _ = await audit(owner_id, item_ids, job_ids)
            assert all(row["completed_at"] for row in after)
            await asyncio.sleep(1)
        report["after_restart"] = after
        report["state"], report["finished_at"] = "passed", timestamp()
        save(report)
        print(json.dumps(report), flush=True)


if __name__ == "__main__":
    result = {"started_at": timestamp(), "state": "started"}
    try:
        asyncio.run(main(result))
    except Exception as error:
        result.update(state="failed", failure_type=type(error).__name__, finished_at=timestamp())
        if EVIDENCE.is_dir():
            save(result)
        print(json.dumps(result), flush=True)
        raise SystemExit(1) from None
