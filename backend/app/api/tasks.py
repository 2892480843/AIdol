from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import select

from app.database import DbSession
from app.models.task import DurableTask
from app.models.user import User
from app.tasks.schemas import RecommendationTaskRequest, TaskListResponse, TaskResponse
from app.tasks.service import cancel_task, create_task, owned_task, retry_task
from app.utils.auth import get_current_user
from app.utils.rate_limit import rate_limit_by_user

router = APIRouter(prefix="/tasks", tags=["Tasks"])
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("/recommendations", response_model=TaskResponse, status_code=202)
async def submit_recommendation(
    request: RecommendationTaskRequest,
    db: DbSession,
    current_user: CurrentUser,
    http_request: Request,
    idempotency_key: Annotated[str | None, Header(min_length=1, max_length=100)] = None,
):
    await rate_limit_by_user(
        str(current_user.id), "task_submit", max_requests=20, window_seconds=60
    )
    return await create_task(
        db,
        current_user.id,
        request.model_dump(mode="json"),
        idempotency_key,
        request_id=getattr(http_request.state, "request_id", None),
    )


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    db: DbSession,
    current_user: CurrentUser,
    kind: Annotated[str, Query(pattern="^recommendation$")] = "recommendation",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    result = await db.execute(
        select(DurableTask)
        .where(DurableTask.user_id == current_user.id, DurableTask.kind == kind)
        .order_by(DurableTask.created_at.desc())
        .limit(limit)
    )
    return TaskListResponse(tasks=[TaskResponse.model_validate(task) for task in result.scalars()])


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: UUID, db: DbSession, current_user: CurrentUser):
    return await owned_task(db, current_user.id, task_id)


@router.post("/{task_id}/cancel", response_model=TaskResponse)
async def cancel(task_id: UUID, db: DbSession, current_user: CurrentUser):
    return await cancel_task(db, current_user.id, task_id)


@router.post("/{task_id}/retry", response_model=TaskResponse)
async def retry(task_id: UUID, db: DbSession, current_user: CurrentUser):
    await rate_limit_by_user(str(current_user.id), "task_retry", max_requests=5, window_seconds=60)
    return await retry_task(db, current_user.id, task_id)
