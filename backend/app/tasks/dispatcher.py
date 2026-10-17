"""Replayable transactional outbox relay; database remains the source of truth."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from arq import create_pool
from arq.jobs import Job, JobStatus
from sqlalchemy import select

from app.config import get_settings
from app.logging_config import configure_logging
from app.models.task import DurableTask, TaskOutbox
from app.tasks.service import add_outbox
from app.workers.db import close_db, get_db_session, init_db
from app.workers.settings import get_redis_settings

logger = logging.getLogger(__name__)
TASK_QUEUE = "arq:recommendations"


def queue_job_id(task_id, generation: int) -> str:
    return f"task:{task_id}:{generation}"


async def recover_tasks(ctx: dict) -> int:
    now = datetime.now(UTC)
    recovered = 0
    async with get_db_session(ctx) as db:
        rows = (
            (
                await db.execute(
                    select(DurableTask)
                    .where(DurableTask.status == "running", DurableTask.lease_until < now)
                    .with_for_update(skip_locked=True)
                    .limit(50)
                )
            )
            .scalars()
            .all()
        )
        for task in rows:
            task.claim_token, task.lease_until = None, None
            if task.attempts >= task.max_attempts:
                task.status, task.stage = "failed", "error"
                task.error_code, task.error = (
                    "interrupted",
                    "Task was interrupted. You can retry it.",
                )
            else:
                task.status, task.stage = "queued", "queued"
                task.generation += 1
                add_outbox(db, task)
            task.updated_at = now
            recovered += 1
        # A Redis restart can discard an already-published job. Replay only queued
        # tasks, never an active execution with a live lease.
        sent = (
            (
                await db.execute(
                    select(TaskOutbox)
                    .join(DurableTask, DurableTask.id == TaskOutbox.task_id)
                    .where(
                        DurableTask.status == "queued",
                        TaskOutbox.generation == DurableTask.generation,
                        TaskOutbox.published_at < now - timedelta(seconds=15),
                    )
                    .with_for_update(of=TaskOutbox, skip_locked=True)
                    .limit(50)
                )
            )
            .scalars()
            .all()
        )
        for event in sent:
            state = await Job(
                queue_job_id(event.task_id, event.generation), ctx["redis"], _queue_name=TASK_QUEUE
            ).status()
            if state in (JobStatus.not_found, JobStatus.complete):
                event.published_at = None
                event.available_at = now
                recovered += 1
        await db.commit()
    return recovered


async def dispatch_pending(ctx: dict) -> int:
    sent = 0
    async with get_db_session(ctx) as db:
        now = datetime.now(UTC)
        events = (
            (
                await db.execute(
                    select(TaskOutbox)
                    .where(TaskOutbox.published_at.is_(None), TaskOutbox.available_at <= now)
                    .order_by(TaskOutbox.created_at)
                    .with_for_update(skip_locked=True)
                    .limit(50)
                )
            )
            .scalars()
            .all()
        )
        for event in events:
            task = await db.get(DurableTask, event.task_id)
            if task is None or task.status != "queued" or task.generation != event.generation:
                event.published_at = now
                continue
            event.attempts += 1
            try:
                await ctx["redis"].enqueue_job(
                    "execute_recommendation_task",
                    str(event.task_id),
                    event.generation,
                    _queue_name=TASK_QUEUE,
                    _job_id=queue_job_id(event.task_id, event.generation),
                )
            except Exception as error:
                # Leave the event unacknowledged. Another relay can retry after
                # this transaction; never return a false success to PostgreSQL.
                event.available_at = now + timedelta(seconds=min(60, 2 ** min(event.attempts, 5)))
                logger.warning("Task dispatch unavailable (error_type=%s)", type(error).__name__)
            else:
                event.published_at = now
                sent += 1
        await db.commit()
    return sent


async def run_dispatcher() -> None:
    configure_logging(get_settings())
    ctx = {}
    await init_db(ctx)
    try:
        while True:
            try:
                if "redis" not in ctx:
                    ctx["redis"] = await create_pool(get_redis_settings())
                await recover_tasks(ctx)
                await dispatch_pending(ctx)
            except Exception as error:
                logger.warning("Outbox relay will retry (error_type=%s)", type(error).__name__)
            await asyncio.sleep(2)
    finally:
        if "redis" in ctx:
            await ctx["redis"].aclose()
        await close_db(ctx)


if __name__ == "__main__":
    asyncio.run(run_dispatcher())
