"""Recorded model replies exercise deterministic wardrobe safety/quality checks.

These fixtures test contract validity and hard constraints; fashion preference
quality still requires human feedback or a separately calibrated model judge.
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest

from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import OutfitSource
from app.services.recommendation_service import EmptyOutfitError, RecommendationService
from app.services.weather_service import WeatherData

CASES = json.loads((Path(__file__).parent / "fixtures/recommendation_quality.json").read_text())


@pytest.mark.asyncio
@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
async def test_recorded_model_reply_obeys_wardrobe_constraints(case, db_session, test_user):
    items = [
        ClothingItem(
            user_id=test_user.id,
            type=kind,
            image_path=f"fixture/{uuid4()}.jpg",
            status=ItemStatus.ready,
            primary_color="black",
        )
        for kind in case["kinds"]
    ]
    db_session.add_all(items)
    await db_session.commit()
    weather = WeatherData(
        temperature=30 if case.get("hot") else 20,
        feels_like=20,
        humidity=50,
        precipitation_chance=0,
        precipitation_mm=0,
        wind_speed=0,
        condition="clear",
        condition_code=0,
        is_day=True,
        uv_index=0,
        timestamp=datetime(2026, 10, 17, tzinfo=UTC),
    )
    service = RecommendationService(db_session)
    # Fixture responses use the same JSON contract as a model completion.
    reply = json.dumps({"outfits": [{"items": case["selected"], "headline": "Quality fixture"}]})
    parsed = service._parse_multi_outfit_response(reply)[0]
    kwargs = {
        "outfit_data": parsed,
        "user": test_user,
        "weather": weather,
        "occasion": "casual",
        "source": OutfitSource.on_demand,
        "number_map": {i: item.id for i, item in enumerate(items, start=1)},
        "mandatory_item_ids": {items[i - 1].id for i in case.get("mandatory", [])},
        "drop_legwear": case.get("hot", False),
    }
    if case.get("reject"):
        with pytest.raises(EmptyOutfitError):
            await service._materialize_outfit(**kwargs)
        return
    outfit = await service._materialize_outfit(**kwargs)
    selected = [oi.item_id for oi in outfit.items]
    assert set(selected) == {items[i - 1].id for i in case["expected"]}
    assert len(selected) == len(set(selected))
    assert outfit.reasoning == "Quality fixture"
