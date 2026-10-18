"""Owner-only, explicitly submitted garment or outfit AI simulation."""

import asyncio
import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select

from app.database import DbSession
from app.models.tryon import TryOnTask
from app.models.user import User
from app.schemas.tryon import TryOnCapabilities, TryOnTaskListResponse, TryOnTaskResponse
from app.services.tryon import MAX_PERSON_BYTES, TryOnService, normalize_item_ids, task_response
from app.storage import StorageUnavailableError
from app.utils.auth import get_current_user
from app.utils.rate_limit import rate_limit_by_user

router = APIRouter(prefix="/tryon", tags=["Try-on"])
CurrentUser = Annotated[User, Depends(get_current_user)]


def get_tryon_service() -> TryOnService:
    return TryOnService()


Service = Annotated[TryOnService, Depends(get_tryon_service)]


@router.get("/capabilities", response_model=TryOnCapabilities)
async def capabilities(current_user: CurrentUser, service: Service):
    return service.capabilities()


@router.post("/tasks", response_model=TryOnTaskResponse, status_code=202)
async def submit(
    db: DbSession,
    current_user: CurrentUser,
    service: Service,
    person_image: Annotated[UploadFile, File()],
    consent: Annotated[bool, Form()],
    idempotency_key: Annotated[str, Header(min_length=1, max_length=100)],
    item_id: Annotated[UUID | None, Form()] = None,
    item_ids: Annotated[str | None, Form(max_length=2048)] = None,
):
    service.require_available()
    if not consent:
        raise HTTPException(422, detail="person_image_consent_required")
    selected = None
    if item_ids is not None:
        try:
            selected = json.loads(item_ids)
        except (json.JSONDecodeError, ValueError):
            raise HTTPException(422, detail="invalid_item_ids") from None
        if not isinstance(selected, list):
            raise HTTPException(422, detail="invalid_item_ids")
    selected = normalize_item_ids(item_id, selected)
    await rate_limit_by_user(
        str(current_user.id), "tryon_submit", max_requests=10, window_seconds=60
    )
    data = await person_image.read(MAX_PERSON_BYTES + 1)
    if len(data) > MAX_PERSON_BYTES:
        raise HTTPException(413, detail="person_image_too_large")
    task = await service.submit(
        db,
        current_user.id,
        selected[0],
        data,
        person_image.content_type or "",
        idempotency_key,
        item_ids=selected,
    )
    return task_response(task)


@router.get("/tasks", response_model=TryOnTaskListResponse)
async def tasks(
    db: DbSession,
    current_user: CurrentUser,
    service: Service,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    await service.reconcile(db, current_user.id)
    result = await db.execute(
        select(TryOnTask)
        .where(TryOnTask.user_id == current_user.id)
        .order_by(TryOnTask.created_at.desc(), TryOnTask.id.desc())
        .limit(limit)
    )
    return TryOnTaskListResponse(items=[task_response(task) for task in result.scalars()])


@router.get("/tasks/{task_id}", response_model=TryOnTaskResponse)
async def task(task_id: UUID, db: DbSession, current_user: CurrentUser, service: Service):
    await service.reconcile(db, current_user.id)
    return task_response(await service.owned(db, current_user.id, task_id))


@router.get("/tasks/{task_id}/image")
async def image(task_id: UUID, db: DbSession, current_user: CurrentUser, service: Service):
    task = await service.owned(db, current_user.id, task_id)
    if task.status != "succeeded" or not task.result_path:
        raise HTTPException(404, detail="Result not found")
    try:
        data = await asyncio.to_thread(service.storage.read, task.result_path)
    except FileNotFoundError:
        raise HTTPException(404, detail="Result not found") from None
    except StorageUnavailableError:
        raise HTTPException(503, detail="image_storage_unavailable") from None
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )
