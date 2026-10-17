"""Transactional AI-tagging outbox. Redis delivery may repeat; item writes are fenced."""

import asyncio
import contextlib
import hashlib
import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from arq.jobs import Job, JobStatus
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import ClothingItem, ItemStatus, TaggedBy
from app.models.tagging_outbox import TaggingOutbox
from app.observability import get_request_id
from app.workers.db import get_db_session
from app.workers.queues import TAGGING_QUEUE

logger = logging.getLogger(__name__)


async def stage_tagging(
    db, item, image_reference: str, *, job_id: str | None = None
) -> TaggingOutbox:
    """Caller must commit this intent and the item together before publication."""
    await db.flush()
    job_id = job_id or str(uuid4())
    item.status, item.ai_job_id = ItemStatus.processing, job_id
    item.ai_started_at, item.ai_completed_at, item.processing_kind = None, None, None
    event = TaggingOutbox(
        job_id=job_id, item_id=item.id, image_reference=image_reference, request_id=get_request_id()
    )
    db.add(event)
    await db.flush()
    return event


def current_generation(item, event) -> bool:
    return bool(
        item
        and item.ai_job_id == event.job_id
        and item.status == ItemStatus.processing
        and item.processing_kind is None
    )


def manual_tags_changed(item, event) -> bool:
    return bool(
        item.tagged_by == TaggedBy.manual and item.tagged_at and item.tagged_at > event.created_at
    )


def tagging_lock_key(item_id) -> int:
    return int.from_bytes(
        hashlib.sha256(f"tagging:{item_id}".encode()).digest()[:8], "big", signed=True
    )


async def complete_tagging(db, job_id: str | None) -> None:
    if job_id:
        await db.execute(
            update(TaggingOutbox)
            .where(TaggingOutbox.job_id == job_id)
            .values(completed_at=datetime.now(UTC))
        )


async def lock_current_item(db, event):
    # Workers lock item -> outbox when completing. Never wait for an item while
    # holding its outbox lock; skip it and retry after that transaction commits.
    return (
        await db.execute(
            select(ClothingItem)
            .where(ClothingItem.id == event.item_id)
            .with_for_update(skip_locked=True)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def publish_tagging(db, redis, job_ids: list[str] | None = None) -> int:
    now = datetime.now(UTC)
    query = select(TaggingOutbox).where(
        TaggingOutbox.completed_at.is_(None),
        TaggingOutbox.published_at.is_(None),
        TaggingOutbox.available_at <= now,
    )
    if job_ids is not None:
        query = query.where(TaggingOutbox.job_id.in_(job_ids))
    events = (
        (
            await db.execute(
                query.order_by(TaggingOutbox.created_at).with_for_update(skip_locked=True).limit(50)
            )
        )
        .scalars()
        .all()
    )
    sent = 0
    for event in events:
        item = await lock_current_item(db, event)
        if item is None:
            # A missing item cascades deletion of this event; a locked item must
            # remain pending until its current owner commits.
            continue
        if not current_generation(item, event):
            event.completed_at = now
            continue
        if manual_tags_changed(item, event):
            item.status, item.ai_job_id, item.ai_started_at = ItemStatus.ready, None, None
            event.completed_at = now
            continue
        event.attempts += 1
        try:
            await redis.enqueue_job(
                "tag_item_image",
                str(event.item_id),
                event.image_reference,
                event.job_id,
                _job_id=event.job_id,
                _queue_name=TAGGING_QUEUE,
            )
        except Exception as error:
            event.available_at = now + timedelta(seconds=min(60, 2 ** min(event.attempts, 5)))
            logger.warning("Tagging publication deferred (error_type=%s)", type(error).__name__)
        else:
            event.published_at = now
            sent += 1
    await db.commit()
    return sent


async def recover_tagging(ctx: dict) -> int:
    now = datetime.now(UTC)
    recovered = 0
    async with get_db_session(ctx) as db:
        events = (
            (
                await db.execute(
                    select(TaggingOutbox)
                    .where(
                        TaggingOutbox.completed_at.is_(None),
                        TaggingOutbox.published_at < now - timedelta(seconds=15),
                    )
                    .with_for_update(skip_locked=True)
                    .limit(100)
                )
            )
            .scalars()
            .all()
        )
        for event in events:
            item = await lock_current_item(db, event)
            if item is None:
                continue
            if not current_generation(item, event):
                event.completed_at = now
                continue
            if manual_tags_changed(item, event):
                item.status, item.ai_job_id, item.ai_started_at = ItemStatus.ready, None, None
                event.completed_at = now
                continue
            status = await Job(event.job_id, ctx["redis"], _queue_name=TAGGING_QUEUE).status()
            if status == JobStatus.complete:
                # arq retains completed results and retry counters; enqueueing
                # that same Redis key can silently no-op until their TTL expires.
                # A fresh generation also fences any uncertain old execution.
                event.completed_at = now
                replacement = await stage_tagging(db, item, event.image_reference)
                replacement.request_id = event.request_id
                recovered += 1
            elif status == JobStatus.not_found:
                event.published_at, event.available_at = None, now
                recovered += 1
        await db.commit()
    return recovered


async def dispatch_tagging(ctx: dict) -> int:
    async with get_db_session(ctx) as db:
        return await publish_tagging(db, ctx["redis"])


async def publish_tagging_now(db, job_ids: list[str], *, connect=None, redis=None) -> None:
    """Best-effort low-latency handoff after the caller's durable commit.

    Publication uses its own session so a timeout/rollback cannot expire the
    already committed item objects the API still needs to serialize.
    """
    if not job_ids:
        return
    pool = redis
    try:
        async with asyncio.timeout(1.0):
            if pool is None:
                if connect is None:
                    return
                pool = await connect()
            async with AsyncSession(bind=db.bind, expire_on_commit=False) as publication_db:
                await publish_tagging(publication_db, pool, job_ids)
    except Exception as error:
        logger.warning("Tagging remains in durable outbox (error_type=%s)", type(error).__name__)
    finally:
        if redis is None and pool is not None:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(pool.aclose(), timeout=0.1)
