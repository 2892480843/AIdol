"""Worn is a recorded wear date, independent of recommendation acceptance."""

from datetime import date
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.family import Family
from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import Outfit, OutfitSource, OutfitStatus, UserFeedback
from app.models.user import User
from app.services.outfit_service import OutfitListFilters, OutfitService
from app.services.studio_service import StudioService

WORN_ON = date(2026, 10, 17)


@pytest_asyncio.fixture
async def worn_records(db_session, test_user):
    item = ClothingItem(
        user_id=test_user.id,
        type="shirt",
        image_path=f"test/{uuid4()}.jpg",
        status=ItemStatus.ready,
    )
    db_session.add(item)
    await db_session.flush()
    studio = StudioService(db_session)
    template = await studio.create_from_scratch(
        user=test_user,
        item_ids=[item.id],
        occasion="casual",
        name="Wear history template",
        scheduled_for=None,
        mark_worn=False,
        source_item_id=None,
    )
    wear = await studio.wear_today(test_user, template.id, WORN_ON)
    older_wear = await studio.wear_today(test_user, template.id, date(2026, 10, 15))
    unworn = Outfit(
        user_id=test_user.id,
        occasion="casual",
        scheduled_for=WORN_ON,
        source=OutfitSource.manual,
        status=OutfitStatus.pending,
    )
    accepted = Outfit(
        user_id=test_user.id,
        occasion="casual",
        scheduled_for=WORN_ON,
        source=OutfitSource.on_demand,
        status=OutfitStatus.accepted,
    )
    accepted.feedback = UserFeedback(accepted=True)
    # The ordinary UI sends worn=True too; the flag alone does not record a wear.
    flag_only = Outfit(
        user_id=test_user.id,
        occasion="casual",
        scheduled_for=WORN_ON,
        source=OutfitSource.on_demand,
        status=OutfitStatus.accepted,
    )
    flag_only.feedback = UserFeedback(actually_worn=True)
    other = User(
        email=f"worn-{uuid4()}@example.com",
        display_name="Other owner",
        is_active=True,
    )
    db_session.add_all([unworn, accepted, flag_only, other])
    await db_session.flush()
    foreign_wear = Outfit(
        user_id=other.id,
        occasion="casual",
        scheduled_for=WORN_ON,
        source=OutfitSource.manual,
        status=OutfitStatus.pending,
    )
    foreign_wear.feedback = UserFeedback(accepted=True, worn_at=WORN_ON)
    db_session.add(foreign_wear)
    await db_session.commit()
    return {
        "template": template,
        "wear": wear,
        "older_wear": older_wear,
        "unworn": unworn,
        "accepted": accepted,
        "flag_only": flag_only,
        "foreign_wear": foreign_wear,
        "other": other,
    }


@pytest.mark.asyncio
async def test_worn_list_and_calendar_include_manual_wear_but_not_acceptance(
    client, auth_headers, worn_records
):
    response = await client.get(
        "/api/v1/outfits", params={"worn": "true", "page_size": 100}, headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {o["id"] for o in body["outfits"]} == {
        str(worn_records[key].id) for key in ("wear", "older_wear")
    }
    assert all(o["status"] == "pending" for o in body["outfits"])

    calendar = await client.get(
        "/api/v1/outfits",
        params={
            "worn": "true",
            "is_lookbook": "false",
            "date_from": str(WORN_ON),
            "date_to": str(WORN_ON),
            "page_size": 1,
        },
        headers=auth_headers,
    )
    assert calendar.status_code == 200
    assert calendar.json()["total"] == 1
    assert calendar.json()["has_more"] is False
    assert [o["id"] for o in calendar.json()["outfits"]] == [str(worn_records["wear"].id)]


@pytest.mark.asyncio
async def test_worn_false_includes_unworn_and_missing_feedback_without_owner_leak(
    client, auth_headers, worn_records
):
    response = await client.get(
        "/api/v1/outfits", params={"worn": "false", "page_size": 100}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["total"] == 4
    assert {o["id"] for o in response.json()["outfits"]} == {
        str(worn_records[key].id) for key in ("template", "unworn", "accepted", "flag_only")
    }


@pytest.mark.asyncio
async def test_worn_bulk_select_uses_same_date_and_owner_predicate(
    client, auth_headers, db_session, test_user, worn_records
):
    ids = await OutfitService(db_session).get_ids_by_filter(
        OutfitListFilters(user_id=test_user.id, worn=True, date_from=WORN_ON, date_to=WORN_ON)
    )
    assert ids == [worn_records["wear"].id]
    response = await client.post(
        "/api/v1/outfits/bulk/delete",
        json={
            "select_all": True,
            "filters": {
                "worn": True,
                "is_lookbook": False,
                "date_from": str(WORN_ON),
                "date_to": str(WORN_ON),
            },
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["deleted"] == 1
    remaining = set(await db_session.scalars(select(Outfit.id)))
    assert worn_records["wear"].id not in remaining
    assert all(
        worn_records[key].id in remaining
        for key in ("template", "older_wear", "unworn", "accepted", "flag_only", "foreign_wear")
    )


@pytest.mark.asyncio
async def test_worn_family_view_requires_membership_and_still_excludes_templates(
    client, auth_headers, db_session, test_user, worn_records
):
    member = worn_records["other"]
    denied = await client.get(
        "/api/v1/outfits",
        params={"worn": "true", "family_member_id": str(member.id)},
        headers=auth_headers,
    )
    assert denied.status_code == 403
    family = Family(
        name="Worn filter family", created_by=test_user.id, invite_code=uuid4().hex[:16]
    )
    db_session.add(family)
    await db_session.flush()
    test_user.family_id = member.family_id = family.id
    # Even a malformed undated record with worn feedback must stay private to its owner.
    hidden_template = Outfit(
        user_id=member.id,
        occasion="casual",
        scheduled_for=None,
        source=OutfitSource.manual,
        status=OutfitStatus.pending,
    )
    hidden_template.feedback = UserFeedback(accepted=True, worn_at=WORN_ON)
    db_session.add(hidden_template)
    await db_session.commit()
    allowed = await client.get(
        "/api/v1/outfits",
        params={"worn": "true", "family_member_id": str(member.id)},
        headers=auth_headers,
    )
    assert allowed.status_code == 200
    assert allowed.json()["total"] == 1
    assert [o["id"] for o in allowed.json()["outfits"]] == [str(worn_records["foreign_wear"].id)]
