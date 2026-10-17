import asyncio
from datetime import UTC, datetime, timedelta
from time import perf_counter
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.item import ClothingItem, ItemStatus, TaggedBy, TaggingStatus
from app.models.tagging_outbox import TaggingOutbox
from app.services.ai_service import ClothingTags
from app.tasks.tagging import publish_tagging, publish_tagging_now, recover_tagging, stage_tagging
from app.workers.tagging import tag_item_image


def image_item(user):
    return ClothingItem(
        id=uuid4(),
        user_id=user.id,
        type="unknown",
        image_path="test/photo.jpg",
        status=ItemStatus.processing,
    )


@pytest.mark.asyncio
async def test_item_and_queue_intent_share_commit_or_rollback(db_session, test_user, session_maker):
    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    item_id, job_id = item.id, event.job_id
    await db_session.flush()
    async with session_maker() as other:
        assert await other.get(ClothingItem, item_id) is None
        assert await other.get(TaggingOutbox, job_id) is None
    await db_session.rollback()
    assert await db_session.get(ClothingItem, item_id) is None
    assert await db_session.get(TaggingOutbox, job_id) is None


@pytest.mark.asyncio
async def test_redis_failure_keeps_committed_intent_for_later_publish(
    db_session, test_user, session_maker
):
    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    job_id = event.job_id
    await db_session.commit()
    redis = AsyncMock()
    redis.enqueue_job.side_effect = ConnectionError("queue unavailable")
    assert await publish_tagging(db_session, redis, [job_id]) == 0
    await db_session.refresh(event)
    assert event.published_at is None
    assert item.status == ItemStatus.processing and item.ai_job_id == job_id
    event.available_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    redis.enqueue_job.side_effect = None
    assert await publish_tagging(db_session, redis, [job_id]) == 1
    assert redis.enqueue_job.call_args.kwargs["_job_id"] == job_id
    assert redis.enqueue_job.call_args.args[3] == job_id


@pytest.mark.asyncio
async def test_immediate_publish_has_bounded_connect_wait_and_preserves_committed_item(
    db_session, test_user
):
    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    await db_session.commit()

    async def unavailable():
        await asyncio.Event().wait()

    started = perf_counter()
    await publish_tagging_now(db_session, [event.job_id], connect=unavailable)
    assert perf_counter() - started < 1.5
    assert item.status == ItemStatus.processing
    await db_session.refresh(event)
    assert event.published_at is None


@pytest.mark.asyncio
async def test_lost_redis_job_is_replayed_without_erroring_item(
    db_session, test_user, session_maker
):
    from arq.jobs import JobStatus

    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    event.published_at = datetime.now(UTC) - timedelta(seconds=30)
    job_id = event.job_id
    await db_session.commit()
    with patch("app.tasks.tagging.Job") as job:
        job.return_value.status = AsyncMock(return_value=JobStatus.not_found)
        assert (
            await recover_tagging({"db_session_factory": session_maker, "redis": AsyncMock()}) >= 1
        )
    await db_session.refresh(event)
    await db_session.refresh(item)
    assert event.published_at is None and item.status == ItemStatus.processing
    assert item.ai_job_id == job_id


@pytest.mark.asyncio
async def test_retained_completed_redis_job_gets_fresh_fenced_generation(
    db_session, test_user, session_maker
):
    from arq.jobs import JobStatus

    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    event.published_at = datetime.now(UTC) - timedelta(seconds=30)
    old_job_id = event.job_id
    await db_session.commit()
    with patch("app.tasks.tagging.Job") as job:
        job.return_value.status = AsyncMock(return_value=JobStatus.complete)
        await recover_tagging({"db_session_factory": session_maker, "redis": AsyncMock()})
    await db_session.refresh(item)
    await db_session.refresh(event)
    assert item.status == ItemStatus.processing and item.ai_job_id != old_job_id
    assert event.completed_at is not None
    replacement = await db_session.get(TaggingOutbox, item.ai_job_id)
    assert replacement is not None and replacement.published_at is None


@pytest.mark.asyncio
async def test_recovery_skips_locked_item_then_observes_manual_completion(
    db_session, test_user, session_maker
):
    from arq.jobs import JobStatus

    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    event.published_at = datetime.now(UTC) - timedelta(seconds=30)
    item_id, job_id = item.id, event.job_id
    await db_session.commit()
    ctx = {"db_session_factory": session_maker, "redis": AsyncMock()}
    with patch("app.tasks.tagging.Job") as job:
        job.return_value.status = AsyncMock(return_value=JobStatus.complete)
        async with session_maker() as manual:
            locked = (
                await manual.execute(
                    select(ClothingItem).where(ClothingItem.id == item_id).with_for_update()
                )
            ).scalar_one()
            await asyncio.wait_for(recover_tagging(ctx), timeout=1)
            locked.status, locked.ai_job_id = ItemStatus.ready, None
            locked.tagged_by, locked.tagged_at = TaggedBy.manual, datetime.now(UTC)
            await manual.commit()
        await recover_tagging(ctx)
    await db_session.refresh(item)
    await db_session.refresh(event)
    assert item.status == ItemStatus.ready and item.ai_job_id is None
    assert event.job_id == job_id and event.completed_at is not None


@pytest.mark.asyncio
async def test_duplicate_delivery_only_materializes_current_generation_once(
    db_session, test_user, session_maker
):
    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    item_id, job_id = item.id, event.job_id
    await db_session.commit()
    analyze = AsyncMock(return_value=ClothingTags(type="shirt", primary_color="blue"))
    with patch("app.workers.tagging.AIService") as ai:
        ai.return_value.analyze_image = analyze
        first = await tag_item_image(
            {"db_session_factory": session_maker}, str(item_id), __file__, job_id
        )
        second = await tag_item_image(
            {"db_session_factory": session_maker}, str(item_id), __file__, job_id
        )
    assert first["status"] == "success" and second["status"] == "stale"
    assert analyze.await_count == 1
    await db_session.refresh(event)
    assert event.completed_at is not None


@pytest.mark.asyncio
async def test_concurrent_duplicate_does_not_call_model_while_first_attempt_holds_item_lock(
    db_session, test_user, session_maker
):
    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    item_id, job_id = item.id, event.job_id
    await db_session.commit()
    started, release = asyncio.Event(), asyncio.Event()

    async def analyze(*args, **kwargs):
        started.set()
        await release.wait()
        return ClothingTags(type="shirt")

    with patch("app.workers.tagging.AIService") as ai:
        ai.return_value.analyze_image = AsyncMock(side_effect=analyze)
        first = asyncio.create_task(
            tag_item_image({"db_session_factory": session_maker}, str(item_id), __file__, job_id)
        )
        await asyncio.wait_for(started.wait(), timeout=2)
        duplicate = await tag_item_image(
            {"db_session_factory": session_maker}, str(item_id), __file__, job_id
        )
        assert duplicate["status"] == "duplicate"
        release.set()
        assert (await first)["status"] == "success"
        assert ai.return_value.analyze_image.await_count == 1


@pytest.mark.asyncio
async def test_stale_sweep_leaves_managed_intent_for_relay(db_session, test_user, session_maker):
    from app.workers.worker import recover_stale_processing_items, stale_processing_cutoff_seconds

    item = image_item(test_user)
    db_session.add(item)
    await stage_tagging(db_session, item, __file__)
    item.ai_started_at = datetime.now(UTC) - timedelta(
        seconds=stale_processing_cutoff_seconds() + 10
    )
    await db_session.commit()
    with patch("app.workers.worker.Job") as job:
        from arq.jobs import JobStatus

        job.return_value.status = AsyncMock(return_value=JobStatus.not_found)
        await recover_stale_processing_items(
            {"db_session_factory": session_maker, "redis": AsyncMock()}
        )
    await db_session.refresh(item)
    assert item.status == ItemStatus.processing and item.ai_failed_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["retry", "manual", "delete"])
async def test_late_model_reply_cannot_overwrite_retry_manual_tags_or_deleted_item(
    change, db_session, test_user, session_maker
):
    item = image_item(test_user)
    db_session.add(item)
    event = await stage_tagging(db_session, item, __file__)
    item_id, job_id = item.id, event.job_id
    await db_session.commit()

    async def analyze(*args, **kwargs):
        async with session_maker() as other:
            current = await other.get(ClothingItem, item_id)
            if change == "delete":
                await other.delete(current)
            elif change == "retry":
                await stage_tagging(other, current, __file__)
            else:
                current.type = "dress"
                current.tagged_by = TaggedBy.manual
                current.tagging_status = TaggingStatus.tagged
                current.tagged_at = datetime.now(UTC)
            await other.commit()
        return ClothingTags(type="shirt", primary_color="blue")

    with patch("app.workers.tagging.AIService") as ai:
        ai.return_value.analyze_image = AsyncMock(side_effect=analyze)
        result = await tag_item_image(
            {"db_session_factory": session_maker}, str(item_id), __file__, job_id
        )
    assert result["status"] == "stale"
    await db_session.rollback()
    current = await db_session.get(ClothingItem, item_id, populate_existing=True)
    if change == "delete":
        assert current is None
    elif change == "manual":
        assert current.type == "dress" and current.tagged_by == TaggedBy.manual
        assert current.primary_color is None
    else:
        assert current.ai_job_id != job_id and current.status == ItemStatus.processing
        assert current.type == "unknown"
