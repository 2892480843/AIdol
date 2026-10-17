import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import ClothingItem, ItemStatus
from app.models.tagging_outbox import TaggingOutbox
from app.services.item_service import ItemService
from app.tasks.tagging import stage_tagging
from tests.test_tagging_durability import _image_bytes


@pytest.mark.asyncio
async def test_item_and_outbox_are_visible_together_before_publication(
    client, auth_headers, db_session, test_user
):
    user_id = test_user.id
    published = []
    redis = AsyncMock()

    async def connect(*args, **kwargs):
        async with AsyncSession(bind=db_session.bind) as observer:
            row = (
                await observer.execute(
                    select(ClothingItem.ai_job_id, TaggingOutbox.job_id)
                    .join(TaggingOutbox, TaggingOutbox.item_id == ClothingItem.id)
                    .where(ClothingItem.user_id == user_id)
                )
            ).one()
            assert row.ai_job_id == row.job_id
            published.append(row.job_id)
        return redis

    with patch("app.api.items.create_pool", new_callable=AsyncMock, side_effect=connect):
        response = await client.post(
            "/api/v1/items",
            files={"image": ("photo.jpg", _image_bytes(11), "image/jpeg")},
            headers=auth_headers,
        )
    assert response.status_code == 201
    assert redis.enqueue_job.call_args.kwargs["_job_id"] == published[0]


@pytest.mark.asyncio
async def test_failed_staging_does_not_commit_an_item_without_an_intent(
    client, auth_headers, db_session, test_user
):
    user_id = test_user.id
    with patch(
        "app.api.items.stage_tagging",
        new_callable=AsyncMock,
        side_effect=RuntimeError("outbox write failed"),
    ):
        with pytest.raises(RuntimeError, match="outbox write failed"):
            await client.post(
                "/api/v1/items",
                files={"image": ("photo.jpg", _image_bytes(12), "image/jpeg")},
                headers=auth_headers,
            )
    await db_session.rollback()
    items = (
        await db_session.execute(select(ClothingItem.id).where(ClothingItem.user_id == user_id))
    ).all()
    assert items == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload,completed",
    [
        ({"type": "dress"}, True),
        ({"name": "My shirt", "notes": "Keep this", "favorite": True}, False),
        ({"tags": {"size": "M"}}, False),
    ],
)
async def test_manual_tag_completion_fences_generation_but_unrelated_edits_do_not(
    client, auth_headers, db_session, test_user, payload, completed
):
    item = ClothingItem(
        user_id=test_user.id,
        type="unknown",
        image_path="user/manual.jpg",
        status=ItemStatus.processing,
    )
    db_session.add(item)
    event = await stage_tagging(db_session, item, "/tmp/wardrobe_test/user/manual.jpg")
    job_id, item_id = event.job_id, item.id
    await db_session.commit()
    response = await client.patch(f"/api/v1/items/{item_id}", json=payload, headers=auth_headers)
    assert response.status_code == 200
    await db_session.refresh(item)
    if completed:
        assert item.status == ItemStatus.ready
        assert item.ai_job_id is None
        assert item.ai_started_at is None
        assert response.json()["tagged_by"] == "manual"
    else:
        assert item.status == ItemStatus.processing
        assert item.ai_job_id == job_id


@pytest.mark.asyncio
async def test_manual_tags_do_not_cancel_rotation_job(client, auth_headers, db_session, test_user):
    item = ClothingItem(
        user_id=test_user.id,
        type="unknown",
        image_path="user/rotate.jpg",
        status=ItemStatus.processing,
        processing_kind="rotate",
        ai_job_id="rotation-job",
    )
    db_session.add(item)
    await db_session.commit()
    response = await client.patch(
        f"/api/v1/items/{item.id}", json={"type": "dress"}, headers=auth_headers
    )
    assert response.status_code == 200
    await db_session.refresh(item)
    assert item.status == ItemStatus.processing
    assert item.ai_job_id == "rotation-job"


@pytest.mark.asyncio
async def test_upload_keeps_item_and_pending_intent_when_redis_is_unavailable(
    client, auth_headers, db_session
):
    with patch(
        "app.api.items.create_pool", new_callable=AsyncMock, side_effect=ConnectionError("offline")
    ):
        response = await client.post(
            "/api/v1/items",
            files={"image": ("photo.jpg", _image_bytes(5), "image/jpeg")},
            headers=auth_headers,
        )
    assert response.status_code == 201
    item = await db_session.get(ClothingItem, UUID(response.json()["id"]))
    assert item.status == ItemStatus.processing
    assert item.ai_job_id
    event = await db_session.get(TaggingOutbox, item.ai_job_id)
    assert event.item_id == item.id
    assert event.published_at is None
    assert event.completed_at is None


@pytest.mark.asyncio
async def test_bulk_upload_commits_every_intent_and_attempts_publication_once(
    client, auth_headers, db_session
):
    files = [
        ("images", (f"photo-{index}.jpg", _image_bytes(index + 6), "image/jpeg"))
        for index in range(3)
    ]
    with patch(
        "app.api.items.create_pool", new_callable=AsyncMock, side_effect=ConnectionError("offline")
    ) as connect:
        response = await client.post("/api/v1/items/bulk", files=files, headers=auth_headers)
    assert response.status_code == 201
    assert response.json()["successful"] == 3
    assert connect.await_count == 1
    item_ids = [UUID(result["item"]["id"]) for result in response.json()["results"]]
    items = (
        (await db_session.execute(select(ClothingItem).where(ClothingItem.id.in_(item_ids))))
        .scalars()
        .all()
    )
    assert all(item.ai_job_id for item in items)
    events = (
        (await db_session.execute(select(TaggingOutbox).where(TaggingOutbox.item_id.in_(item_ids))))
        .scalars()
        .all()
    )
    assert {event.job_id for event in events} == {item.ai_job_id for item in items}
    assert all(event.published_at is None for event in events)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure", [RuntimeError("staging failed"), ValueError("invalid image reference")]
)
@pytest.mark.parametrize("write_intent_first", [False, True])
async def test_bulk_staging_failure_rolls_back_only_failed_item_and_continues(
    client, auth_headers, db_session, test_user, failure, write_intent_first
):
    user_id = test_user.id
    calls = 0

    async def stage_then_fail(db, item, reference, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2 and not write_intent_first:
            raise failure
        event = await stage_tagging(db, item, reference, **kwargs)
        if calls == 2:
            raise failure
        return event

    files = [("images", (f"photo-{i}.jpg", _image_bytes(i + 20), "image/jpeg")) for i in range(3)]
    with (
        patch("app.api.items.stage_tagging", side_effect=stage_then_fail),
        patch(
            "app.api.items.create_pool",
            new_callable=AsyncMock,
            side_effect=ConnectionError("offline"),
        ),
    ):
        response = await client.post("/api/v1/items/bulk", files=files, headers=auth_headers)
    assert response.status_code == 201
    assert [result["success"] for result in response.json()["results"]] == [True, False, True]
    await db_session.commit()
    items = (
        (await db_session.execute(select(ClothingItem).where(ClothingItem.user_id == user_id)))
        .scalars()
        .all()
    )
    events = (
        (
            await db_session.execute(
                select(TaggingOutbox)
                .join(ClothingItem, ClothingItem.id == TaggingOutbox.item_id)
                .where(ClothingItem.user_id == user_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(items) == len(events) == 2
    assert {item.ai_job_id for item in items} == {event.job_id for event in events}


@pytest.mark.asyncio
async def test_non_ai_bulk_failure_keeps_prior_and_later_successes(
    client, auth_headers, db_session, test_user
):
    user_id = test_user.id
    calls = 0
    create = ItemService.create

    async def create_then_fail(service, *args, **kwargs):
        nonlocal calls
        calls += 1
        item = await create(service, *args, **kwargs)
        if calls == 2:
            raise RuntimeError("failure after flush")
        return item

    files = [("images", (f"photo-{i}.jpg", _image_bytes(i + 24), "image/jpeg")) for i in range(3)]
    with patch("app.api.items.ItemService.create", new=create_then_fail):
        response = await client.post(
            "/api/v1/items/bulk", files=files, data={"skip_ai": "true"}, headers=auth_headers
        )
    assert response.status_code == 201
    assert [result["success"] for result in response.json()["results"]] == [True, False, True]
    await db_session.commit()
    items = (
        (await db_session.execute(select(ClothingItem).where(ClothingItem.user_id == user_id)))
        .scalars()
        .all()
    )
    assert len(items) == 2
    assert all(item.status == ItemStatus.ready for item in items)


@pytest.mark.asyncio
@pytest.mark.parametrize("slow_connection", [False, True])
async def test_bulk_cancel_fences_offline_intents_before_attempting_redis(
    client, auth_headers, db_session, test_user, slow_connection
):
    item = ClothingItem(
        user_id=test_user.id,
        type="shirt",
        image_path="user/offline-cancel.jpg",
        status=ItemStatus.processing,
    )
    db_session.add(item)
    event = await stage_tagging(db_session, item, "/tmp/wardrobe_test/user/offline-cancel.jpg")
    item_id, job_id = item.id, event.job_id
    await db_session.commit()

    async def offline(*args, **kwargs):
        async with AsyncSession(bind=db_session.bind) as observer:
            stored = await observer.get(ClothingItem, item_id)
            assert stored.status == ItemStatus.ready
            assert stored.ai_job_id is None
        if slow_connection:
            await asyncio.sleep(30)
        raise ConnectionError("offline")

    with patch("app.api.items.create_pool", new_callable=AsyncMock, side_effect=offline):
        response = await asyncio.wait_for(
            client.post(
                "/api/v1/items/bulk/cancel-analysis",
                json={"item_ids": [str(item_id)]},
                headers=auth_headers,
            ),
            timeout=2.0,
        )
    assert response.status_code == 200
    assert response.json()["cancelled"] == 1
    await db_session.refresh(item)
    assert item.status == ItemStatus.ready
    assert item.ai_job_id is None
    assert item.ai_started_at is None
    assert (await db_session.get(TaggingOutbox, job_id)).item_id == item_id


@pytest.mark.asyncio
@pytest.mark.parametrize("bulk", [False, True])
async def test_explicit_retry_preserves_claim_and_intent_across_queue_outage(
    client, auth_headers, db_session, test_user, bulk
):
    item = ClothingItem(
        user_id=test_user.id,
        type="shirt",
        image_path="user/retry.jpg",
        status=ItemStatus.error,
        ai_failed_at=datetime.now(UTC) - timedelta(seconds=200),
    )
    db_session.add(item)
    await db_session.commit()
    item_id = item.id
    with patch(
        "app.api.items.create_pool", new_callable=AsyncMock, side_effect=ConnectionError("offline")
    ):
        response = await client.post(
            "/api/v1/items/bulk/analyze" if bulk else f"/api/v1/items/{item_id}/analyze",
            json={"item_ids": [str(item_id)]} if bulk else None,
            headers=auth_headers,
        )
    assert response.status_code == 200
    assert response.json()["queued"] == 1 if bulk else response.json()["status"] == "queued"
    await db_session.refresh(item)
    assert item.status == ItemStatus.processing
    assert item.ai_failed_at < datetime.now(UTC) - timedelta(seconds=100)
    event = await db_session.get(TaggingOutbox, item.ai_job_id)
    assert event is not None
    assert event.published_at is None
    if not bulk:
        assert response.json()["job_id"] == event.job_id
