from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.recommendation import SuggestRequest


class RecommendationTaskRequest(SuggestRequest):
    count: int = Field(default=1, ge=1, le=3)


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    kind: str
    status: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    stage: str
    attempts: int
    max_attempts: int
    request: dict
    result: dict | None
    error: str | None
    error_code: str | None
    created_at: datetime
    updated_at: datetime


class TaskListResponse(BaseModel):
    tasks: list[TaskResponse]
