import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import DurableTask, TaskOutbox

ACTIVE_STATUSES = ("queued", "running")
MAX_ACTIVE_PER_USER = 3


def advisory_key(value: UUID) -> int:
    return int.from_bytes(hashlib.sha256(value.bytes).digest()[:8], "big", signed=True)


async def owned_task(
    db: AsyncSession, user_id: UUID, task_id: UUID, *, lock: bool = False
) -> DurableTask:
    query = select(DurableTask).where(DurableTask.id == task_id, DurableTask.user_id == user_id)
    if lock:
        query = query.with_for_update()
    task = (await db.execute(query.execution_options(populate_existing=True))).scalar_one_or_none()
    if task is None:
        raise HTTPException(404, "Task not found")
    return task


def add_outbox(db: AsyncSession, task: DurableTask) -> None:
    db.add(TaskOutbox(task_id=task.id, generation=task.generation))


async def create_task(
    db: AsyncSession,
    user_id: UUID,
    payload: dict,
    key: str | None,
    *,
    request_id: str | None = None,
) -> DurableTask:
    # Serialize submission per user: both idempotency and the active-task cap must hold
    # under concurrent requests, even when Redis is unavailable.
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": advisory_key(user_id)})
    digest = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if key:
        previous = (
            await db.execute(
                select(DurableTask).where(
                    DurableTask.user_id == user_id, DurableTask.idempotency_key == key
                )
            )
        ).scalar_one_or_none()
        if previous:
            if previous.request_hash != digest:
                raise HTTPException(409, "Idempotency key was already used for a different request")
            return previous
    active = await db.scalar(
        select(func.count())
        .select_from(DurableTask)
        .where(DurableTask.user_id == user_id, DurableTask.status.in_(ACTIVE_STATUSES))
    )
    if active >= MAX_ACTIVE_PER_USER:
        raise HTTPException(
            409, "There are already three active tasks. Wait for one to finish or cancel it."
        )
    task = DurableTask(
        user_id=user_id,
        request=payload,
        request_hash=digest,
        idempotency_key=key,
        request_id=request_id,
    )
    db.add(task)
    await db.flush()
    add_outbox(db, task)
    # Commit before returning 202: no dependency on a live queue or dispatcher.
    await db.commit()
    await db.refresh(task)
    return task


async def cancel_task(db: AsyncSession, user_id: UUID, task_id: UUID) -> DurableTask:
    task = await owned_task(db, user_id, task_id, lock=True)
    if task.status == "cancelled":
        return task
    if task.status not in ACTIVE_STATUSES:
        raise HTTPException(409, "Only active tasks can be cancelled")
    task.status, task.stage = "cancelled", "cancelled"
    task.claim_token, task.lease_until = None, None
    task.error, task.error_code = None, None
    task.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(task)
    return task


async def retry_task(db: AsyncSession, user_id: UUID, task_id: UUID) -> DurableTask:
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": advisory_key(user_id)})
    task = await owned_task(db, user_id, task_id, lock=True)
    if task.status != "failed":
        raise HTTPException(409, "Only failed tasks can be retried")
    active = await db.scalar(
        select(func.count())
        .select_from(DurableTask)
        .where(DurableTask.user_id == user_id, DurableTask.status.in_(ACTIVE_STATUSES))
    )
    if active >= MAX_ACTIVE_PER_USER:
        raise HTTPException(409, "There are already three active tasks")
    task.status, task.stage, task.attempts = "queued", "queued", 0
    task.generation += 1
    task.claim_token, task.lease_until, task.error, task.error_code, task.result = (
        None,
        None,
        None,
        None,
        None,
    )
    task.updated_at = datetime.now(UTC)
    add_outbox(db, task)
    await db.commit()
    await db.refresh(task)
    return task
