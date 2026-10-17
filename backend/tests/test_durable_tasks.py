"""Durable tasks are persisted before queue access and isolated by user."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import delete, select


@pytest_asyncio.fixture(autouse=True)
async def isolated_task_queue(db_session):
    # The suite deliberately exercises a global relay batch. Old records from a
    # previous run must not fill its 50-row batch ahead of this test's event.
    from app.models.task import DurableTask

    await db_session.execute(delete(DurableTask))
    await db_session.commit()


@pytest.mark.asyncio
async def test_submission_is_durable_and_idempotent_without_redis(client, auth_headers, db_session):
    headers = {**auth_headers, "Idempotency-Key": str(uuid4())}
    body = {"occasion": "casual", "count": 3}
    first = await client.post("/api/v1/tasks/recommendations", json=body, headers=headers)
    assert first.status_code == 202, first.text
    task = first.json()
    assert task["status"] == "queued"
    assert task["request"]["count"] == 3
    second = await client.post("/api/v1/tasks/recommendations", json=body, headers=headers)
    assert second.status_code == 202
    assert second.json()["id"] == task["id"]
    from app.models.task import TaskOutbox

    events = (
        (await db_session.execute(select(TaskOutbox).where(TaskOutbox.task_id == task["id"])))
        .scalars()
        .all()
    )
    assert len(events) == 1


@pytest.mark.asyncio
async def test_idempotency_key_cannot_change_payload(client, auth_headers):
    headers = {**auth_headers, "Idempotency-Key": str(uuid4())}
    first = await client.post("/api/v1/tasks/recommendations", json={"count": 1}, headers=headers)
    assert first.status_code == 202
    changed = await client.post("/api/v1/tasks/recommendations", json={"count": 3}, headers=headers)
    assert changed.status_code == 409


@pytest.mark.asyncio
async def test_task_list_and_lookup_are_owner_scoped(client, auth_headers):
    result = await client.post("/api/v1/tasks/recommendations", json={}, headers=auth_headers)
    assert result.status_code == 202
    task_id = result.json()["id"]
    listing = await client.get("/api/v1/tasks?kind=recommendation", headers=auth_headers)
    assert task_id in [task["id"] for task in listing.json()["tasks"]]
    assert (await client.get(f"/api/v1/tasks/{uuid4()}", headers=auth_headers)).status_code == 404
    assert (await client.get(f"/api/v1/tasks/{task_id}")).status_code == 401


@pytest.mark.asyncio
async def test_cancel_is_terminal_and_cannot_retry(client, auth_headers):
    task = (
        await client.post("/api/v1/tasks/recommendations", json={}, headers=auth_headers)
    ).json()
    response = await client.post(f"/api/v1/tasks/{task['id']}/cancel", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    repeated = await client.post(f"/api/v1/tasks/{task['id']}/cancel", headers=auth_headers)
    assert repeated.json()["status"] == "cancelled"
    assert (
        await client.post(f"/api/v1/tasks/{task['id']}/retry", headers=auth_headers)
    ).status_code == 409


@pytest.mark.asyncio
async def test_validates_count_and_exclusion_bounds(client, auth_headers):
    for count in (0, 4):
        r = await client.post(
            "/api/v1/tasks/recommendations", json={"count": count}, headers=auth_headers
        )
        assert r.status_code == 422
    r = await client.post(
        "/api/v1/tasks/recommendations",
        json={"exclude_items": [str(uuid4())] * 201},
        headers=auth_headers,
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_another_user_cannot_read_cancel_or_retry_task(client, auth_headers, db_session):
    from app.models.user import User
    from app.tasks.service import create_task

    other = User(
        id=uuid4(),
        external_id=str(uuid4()),
        email=f"other-{uuid4()}@example.com",
        display_name="Other",
        is_active=True,
    )
    db_session.add(other)
    await db_session.commit()
    task = await create_task(db_session, other.id, {"count": 1}, None)
    for path, method in [
        (f"/api/v1/tasks/{task.id}", "get"),
        (f"/api/v1/tasks/{task.id}/cancel", "post"),
        (f"/api/v1/tasks/{task.id}/retry", "post"),
    ]:
        assert (await getattr(client, method)(path, headers=auth_headers)).status_code == 404
    listing = (await client.get("/api/v1/tasks", headers=auth_headers)).json()
    assert str(task.id) not in [row["id"] for row in listing["tasks"]]


@pytest.mark.asyncio
async def test_retry_failed_task_creates_new_outbox_generation(client, auth_headers, db_session):
    from uuid import UUID

    from app.models.task import DurableTask, TaskOutbox

    result = await client.post("/api/v1/tasks/recommendations", json={}, headers=auth_headers)
    task = await db_session.get(DurableTask, UUID(result.json()["id"]))
    task.status, task.stage, task.attempts = "failed", "error", 3
    await db_session.commit()
    retry = await client.post(f"/api/v1/tasks/{task.id}/retry", headers=auth_headers)
    assert retry.status_code == 200
    assert retry.json()["status"] == "queued"
    events = (
        (await db_session.execute(select(TaskOutbox).where(TaskOutbox.task_id == task.id)))
        .scalars()
        .all()
    )
    assert sorted(row.generation for row in events) == [1, 2]


@pytest.mark.asyncio
async def test_active_task_limit_is_enforced_without_redis(client, auth_headers):
    for _ in range(3):
        assert (
            await client.post("/api/v1/tasks/recommendations", json={}, headers=auth_headers)
        ).status_code == 202
    assert (
        await client.post("/api/v1/tasks/recommendations", json={}, headers=auth_headers)
    ).status_code == 409


@pytest.mark.asyncio
async def test_dispatch_failure_leaves_replayable_event(db_session, test_user, session_maker):
    from datetime import UTC, datetime, timedelta

    from app.models.task import TaskOutbox
    from app.tasks.dispatcher import dispatch_pending
    from app.tasks.service import create_task

    task = await create_task(db_session, test_user.id, {"count": 1}, None)
    task_id = task.id
    redis = AsyncMock()
    redis.enqueue_job.side_effect = ConnectionError("queue offline")
    ctx = {"db_session_factory": session_maker, "redis": redis}
    assert await dispatch_pending(ctx) == 0
    await db_session.rollback()
    event = (
        await db_session.execute(select(TaskOutbox).where(TaskOutbox.task_id == task_id))
    ).scalar_one()
    assert event.published_at is None and event.attempts == 1
    event.available_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    redis.enqueue_job.side_effect = None
    assert await dispatch_pending(ctx) >= 1
    await db_session.refresh(event)
    assert event.published_at is not None
    assert await dispatch_pending(ctx) == 0


@pytest.mark.asyncio
async def test_duplicate_execution_commits_one_business_result(
    db_session, test_user, session_maker
):
    from app.models.outfit import Outfit, OutfitSource
    from app.models.task import DurableTask
    from app.tasks.execution import execute_recommendation_task
    from app.tasks.service import create_task

    task = await create_task(db_session, test_user.id, {"count": 1}, None)
    task_id, user_id = task.id, test_user.id
    calls = []

    async def generate(ctx, db, *_):
        outfit = Outfit(user_id=user_id, occasion="casual", source=OutfitSource.on_demand)
        db.add(outfit)
        await db.flush()
        calls.append(outfit.id)
        return [outfit]

    ctx = {"db_session_factory": session_maker}
    with patch("app.tasks.execution._generate", side_effect=generate):
        await execute_recommendation_task(ctx, str(task_id), 1)
        await execute_recommendation_task(ctx, str(task_id), 1)
    await db_session.rollback()
    state = await db_session.get(DurableTask, task_id, populate_existing=True)
    assert state.status == "succeeded"
    assert len(calls) == 1
    assert state.result["outfit_ids"] == [str(calls[0])]
    assert (
        len(
            (await db_session.execute(select(Outfit).where(Outfit.user_id == user_id)))
            .scalars()
            .all()
        )
        == 1
    )


@pytest.mark.asyncio
async def test_cancellation_during_generation_rolls_back_outfits(
    db_session, test_user, session_maker
):
    from app.models.outfit import Outfit, OutfitSource
    from app.models.task import DurableTask
    from app.tasks.execution import execute_recommendation_task
    from app.tasks.service import cancel_task, create_task

    task = await create_task(db_session, test_user.id, {"count": 1}, None)
    task_id, user_id = task.id, test_user.id

    async def generate(ctx, db, *_):
        outfit = Outfit(user_id=user_id, occasion="casual", source=OutfitSource.on_demand)
        db.add(outfit)
        await db.flush()
        async with session_maker() as control:
            await cancel_task(control, user_id, task_id)
        return [outfit]

    with patch("app.tasks.execution._generate", side_effect=generate):
        await execute_recommendation_task({"db_session_factory": session_maker}, str(task_id), 1)
    await db_session.rollback()
    assert (
        await db_session.get(DurableTask, task_id, populate_existing=True)
    ).status == "cancelled"
    assert (
        not (await db_session.execute(select(Outfit).where(Outfit.user_id == user_id)))
        .scalars()
        .all()
    )


@pytest.mark.asyncio
async def test_failure_after_partial_generation_rolls_back_all_results(
    db_session, test_user, session_maker
):
    from app.models.outfit import Outfit, OutfitSource
    from app.models.task import DurableTask, TaskOutbox
    from app.services.recommendation_service import AIRecommendationError
    from app.tasks.execution import execute_recommendation_task
    from app.tasks.service import create_task

    task = await create_task(db_session, test_user.id, {"count": 3}, None)
    task_id, user_id = task.id, test_user.id

    async def generate(ctx, db, *_):
        db.add(Outfit(user_id=user_id, occasion="casual", source=OutfitSource.on_demand))
        await db.flush()
        raise AIRecommendationError("synthetic upstream error")

    with patch("app.tasks.execution._generate", side_effect=generate):
        await execute_recommendation_task({"db_session_factory": session_maker}, str(task_id), 1)
    await db_session.rollback()
    state = await db_session.get(DurableTask, task_id, populate_existing=True)
    assert state.status == "queued" and state.generation == 2
    assert state.error_code == "ai_unavailable"
    assert (
        not (await db_session.execute(select(Outfit).where(Outfit.user_id == user_id)))
        .scalars()
        .all()
    )
    assert (
        len(
            (await db_session.execute(select(TaskOutbox).where(TaskOutbox.task_id == task_id)))
            .scalars()
            .all()
        )
        == 2
    )


@pytest.mark.asyncio
async def test_expired_worker_lease_requeues_with_new_generation(
    db_session, test_user, session_maker
):
    from datetime import UTC, datetime, timedelta

    from app.models.task import DurableTask
    from app.tasks.dispatcher import recover_tasks
    from app.tasks.service import create_task

    task = await create_task(db_session, test_user.id, {"count": 1}, None)
    task_id = task.id
    task.status, task.stage, task.attempts = "running", "generating", 1
    task.lease_until = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    from arq.jobs import JobStatus

    with patch("app.tasks.dispatcher.Job") as job:
        job.return_value.status = AsyncMock(return_value=JobStatus.queued)
        await recover_tasks({"db_session_factory": session_maker, "redis": AsyncMock()})
    await db_session.rollback()
    state = await db_session.get(DurableTask, task_id, populate_existing=True)
    assert state.status == "queued" and state.generation == 2
