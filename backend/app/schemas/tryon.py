from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

TRYON_ITEM_SLOTS = {
    "shirt": "tops",
    "t-shirt": "tops",
    "top": "tops",
    "polo": "tops",
    "blouse": "tops",
    "tank-top": "tops",
    "sweater": "tops",
    "hoodie": "tops",
    "pants": "bottoms",
    "jeans": "bottoms",
    "shorts": "bottoms",
    "skirt": "bottoms",
    "dress": "dresses",
    "jumpsuit": "dresses",
    "jacket": "outerwear",
    "coat": "outerwear",
    "blazer": "outerwear",
    "vest": "outerwear",
    "cardigan": "outerwear",
    "shoes": "shoes",
    "sneakers": "shoes",
    "boots": "shoes",
    "sandals": "shoes",
}
TRYON_CATEGORIES = ("tops", "bottoms", "dresses", "outerwear", "shoes")
MAX_TRYON_ITEMS = 4


class TryOnCapabilities(BaseModel):
    configured: bool
    enabled: bool
    available: bool
    reason: Literal["not_configured", "disabled"] | None
    provider: Literal["seedream"] = "seedream"
    model: str
    accepted_mime_types: list[str] = ["image/jpeg", "image/png", "image/webp"]
    max_person_image_bytes: int = 10 * 1024 * 1024
    supported_categories: list[str] = Field(default_factory=lambda: list(TRYON_CATEGORIES))
    supported_item_types: list[str] = Field(default_factory=lambda: list(TRYON_ITEM_SLOTS))
    item_type_slots: dict[str, str] = Field(default_factory=lambda: dict(TRYON_ITEM_SLOTS))
    max_items: int = MAX_TRYON_ITEMS
    output: Literal["image"] = "image"
    poll_interval_ms: int = 3000


class TryOnTaskResponse(BaseModel):
    id: UUID
    item_id: UUID
    item_ids: list[UUID] = Field(default_factory=list)
    status: Literal["submitting", "queued", "processing", "succeeded", "failed"]
    result_url: str | None = None
    error_code: str | None = None
    created_at: datetime
    updated_at: datetime


class TryOnTaskListResponse(BaseModel):
    items: list[TryOnTaskResponse]
