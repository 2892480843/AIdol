"""Fenced, cancellable recommendation execution with atomic business results."""

import asyncio
import contextlib
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select, text, update
from sqlalchemy.orm import selectinload

from app.models.task import DurableTask
from app.models.user import User
from app.schemas.outfit import stored_occasion_or_default
from app.services.ai_service import AIDisabledError
from app.services.recommendation_service import (
    AIRecommendationError,
    InsufficientWardrobeError,
    RecommendationService,
)
from app.services.weather_service import WeatherData
from app.tasks.schemas import RecommendationTaskRequest
from app.tasks.service import add_outbox, advisory_key
from app.workers.db import get_db_session

logger = logging.getLogger(__name__)
LEASE_SECONDS = 45
TASK_TIMEOUT_SECONDS = 180


async def _heartbeat(ctx, task_id, token, stopped, owner):
    while not stopped.is_set():
        try:
            await asyncio.wait_for(stopped.wait(), timeout=10)
        except TimeoutError:
            try:
                async with get_db_session(ctx) as db:
                    result = await db.execute(
                        update(DurableTask)
                        .where(
                            DurableTask.id == task_id,
                            DurableTask.claim_token == token,
                            DurableTask.status == "running",
                        )
                        .values(lease_until=datetime.now(UTC) + timedelta(seconds=LEASE_SECONDS))
                    )
                    await db.commit()
                    if result.rowcount == 0:
                        state = await db.get(DurableTask, task_id)
                        if not stopped.is_set() and state and state.status != "succeeded":
                            owner.cancel()
                        return
            except Exception as error:
                # A lost heartbeat may expire the lease. The final claim-token
                # check fences this attempt if recovery has already reassigned it.
                logger.warning("Task heartbeat unavailable (error_type=%s)", type(error).__name__)


async def _claim(ctx, task_id, generation, token):
    async with get_db_session(ctx) as db:
        task = (
            await db.execute(select(DurableTask).where(DurableTask.id == task_id).with_for_update())
        ).scalar_one_or_none()
        if task is None or task.status != "queued" or task.generation != generation:
            return None
        task.status, task.stage = "running", "preparing"
        task.attempts += 1
        task.claim_token, task.lease_until = (
            token,
            datetime.now(UTC) + timedelta(seconds=LEASE_SECONDS),
        )
        task.error, task.error_code = None, None
        await db.commit()
        return task.user_id, task.request, task.request_id


async def _stage(ctx, task_id, token, stage):
    async with get_db_session(ctx) as db:
        await db.execute(
            update(DurableTask)
            .where(
                DurableTask.id == task_id,
                DurableTask.claim_token == token,
                DurableTask.status == "running",
            )
            .values(stage=stage)
        )
        await db.commit()


async def _fail(ctx, task_id, token, code, message, *, retryable=False):
    async with get_db_session(ctx) as db:
        task = (
            await db.execute(select(DurableTask).where(DurableTask.id == task_id).with_for_update())
        ).scalar_one_or_none()
        if task is None or task.claim_token != token or task.status != "running":
            return
        task.error_code, task.error = code, message
        task.claim_token, task.lease_until = None, None
        task.updated_at = datetime.now(UTC)
        if retryable and task.attempts < task.max_attempts:
            task.status, task.stage = "queued", "queued"
            task.generation += 1
            add_outbox(db, task)
        else:
            task.status, task.stage = "failed", "error"
        await db.commit()


async def _generate(ctx, db, task_id, token, user_id, payload):
    request = RecommendationTaskRequest.model_validate(payload)
    user = (
        await db.execute(
            select(User).where(User.id == user_id).options(selectinload(User.preferences))
        )
    ).scalar_one()
    if not user.is_active:
        raise ValueError("User is inactive")
    weather = None
    if request.weather_override:
        w = request.weather_override
        weather = WeatherData(
            temperature=w.temperature,
            feels_like=w.feels_like if w.feels_like is not None else w.temperature,
            humidity=w.humidity,
            precipitation_chance=w.precipitation_chance,
            precipitation_mm=0,
            wind_speed=0,
            condition=w.condition,
            condition_code=0,
            is_day=True,
            uv_index=0,
            timestamp=datetime.now(UTC),
        )
    occasion = request.occasion or stored_occasion_or_default(
        user.preferences.default_occasion if user.preferences else None
    )
    await _stage(ctx, task_id, token, "generating")
    return await RecommendationService(db, commit_outfits=False).generate_recommendations(
        user=user,
        occasion=occasion,
        weather_override=weather,
        exclude_items=request.exclude_items,
        include_items=request.include_items,
        time_of_day=request.time_of_day,
        count=request.count,
    )


async def execute_recommendation_task(ctx: dict, task_id: str, generation: int) -> None:
    task_uuid, token = UUID(task_id), uuid4()
    stopped = asyncio.Event()
    heartbeat = None
    async with get_db_session(ctx) as db:
        # Transaction-scoped advisory lock is released even on SIGKILL/connection
        # loss. Keep it throughout inference; a duplicate delivery cannot execute
        # concurrently. Control/heartbeat writes use separate short transactions.
        locked = await db.scalar(
            text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": advisory_key(task_uuid)}
        )
        if not locked:
            return
        claim = await _claim(ctx, task_uuid, generation, token)
        if claim is None:
            return
        user_id, payload, request_id = claim
        heartbeat = asyncio.create_task(
            _heartbeat(ctx, task_uuid, token, stopped, asyncio.current_task())
        )
        try:
            from app.observability import task_context

            with task_context(task_id, request_id=request_id):
                outfits = await asyncio.wait_for(
                    _generate(ctx, db, task_uuid, token, user_id, payload),
                    timeout=TASK_TIMEOUT_SECONDS,
                )
            task = (
                await db.execute(
                    select(DurableTask)
                    .where(DurableTask.id == task_uuid)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            ).scalar_one()
            if task.status != "running" or task.claim_token != token:
                await db.rollback()
                return
            task.status, task.stage = "succeeded", "completed"
            task.result = {"outfit_ids": [str(outfit.id) for outfit in outfits]}
            task.claim_token, task.lease_until = None, None
            task.updated_at = datetime.now(UTC)
            await db.commit()
        except asyncio.CancelledError:
            await db.rollback()
            await _fail(
                ctx,
                task_uuid,
                token,
                "interrupted",
                "Task was interrupted and will be recovered.",
                retryable=True,
            )
            raise
        except Exception as error:
            await db.rollback()
            if isinstance(error, InsufficientWardrobeError):
                code, message, retryable = (
                    "insufficient_wardrobe",
                    "Add more available clothing or adjust the filters.",
                    False,
                )
            elif isinstance(error, AIDisabledError):
                code, message, retryable = (
                    "ai_disabled",
                    "AI recommendations are currently disabled.",
                    False,
                )
            elif isinstance(error, ValueError):
                code, message, retryable = (
                    "invalid_request",
                    "Check the selected clothing, location and weather settings.",
                    False,
                )
            elif isinstance(error, TimeoutError):
                code, message, retryable = (
                    "timeout",
                    "The model took too long. The task can be retried.",
                    True,
                )
            else:
                code, message, retryable = (
                    "ai_unavailable",
                    "The recommendation service is temporarily unavailable.",
                    isinstance(error, AIRecommendationError),
                )
            logger.warning(
                "Task attempt failed (task_id=%s error_type=%s)", task_id, type(error).__name__
            )
            await _fail(ctx, task_uuid, token, code, message, retryable=retryable)
        finally:
            stopped.set()
            if heartbeat:
                heartbeat.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await heartbeat
