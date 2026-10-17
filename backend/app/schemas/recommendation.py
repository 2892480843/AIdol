"""Shared synchronous and durable recommendation request contract."""

from uuid import UUID

from pydantic import BaseModel, Field

from app.models.outfit import TimeOfDay
from app.schemas.outfit import Occasion


class WeatherOverrideRequest(BaseModel):
    temperature: float = Field(description="Temperature in Celsius", ge=-90, le=65)
    feels_like: float | None = Field(None, ge=-100, le=80)
    condition: str = Field(default="unknown", max_length=100)
    precipitation_chance: int = Field(default=0, ge=0, le=100)
    humidity: int = Field(default=50, ge=0, le=100)


class SuggestRequest(BaseModel):
    occasion: Occasion | None = None
    time_of_day: TimeOfDay | None = None
    weather_override: WeatherOverrideRequest | None = None
    exclude_items: list[UUID] = Field(default_factory=list, max_length=200)
    include_items: list[UUID] = Field(default_factory=list, max_length=200)
