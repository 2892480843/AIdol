"""Studio source references obey the same owner boundary as selected garments."""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import Outfit
from app.models.user import User


async def _item(db_session, user_id):
    item = ClothingItem(
        user_id=user_id,
        type="shirt",
        status=ItemStatus.ready,
        image_path=f"test/{uuid4()}.jpg",
    )
    db_session.add(item)
    await db_session.commit()
    return item


@pytest.mark.asyncio
@pytest.mark.parametrize("source_kind", ["missing", "other_owner"])
async def test_studio_rejects_non_owned_source_before_persisting_an_outfit(
    client, db_session, test_user, auth_headers, source_kind
):
    selected = await _item(db_session, test_user.id)
    source_id = uuid4()
    if source_kind == "other_owner":
        other = User(
            id=uuid4(),
            external_id=str(uuid4()),
            email=f"{uuid4()}@example.com",
            display_name="Other owner",
            is_active=True,
        )
        db_session.add(other)
        await db_session.commit()
        source_id = (await _item(db_session, other.id)).id

    response = await client.post(
        "/api/v1/outfits/studio",
        headers=auth_headers,
        json={
            "items": [str(selected.id)],
            "occasion": "casual",
            "source_item_id": str(source_id),
        },
    )

    assert response.status_code == 403, response.text
    assert response.json()["detail"]["error_code"] == "OUTFIT_ITEM_OWNERSHIP"
    assert await db_session.scalar(
        select(func.count()).select_from(Outfit).where(Outfit.user_id == test_user.id)
    ) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("source_is_selected", [True, False])
async def test_studio_preserves_owned_source_reference_without_adding_it_to_the_selection(
    client, db_session, test_user, auth_headers, source_is_selected
):
    selected = await _item(db_session, test_user.id)
    source = selected if source_is_selected else await _item(db_session, test_user.id)

    response = await client.post(
        "/api/v1/outfits/studio",
        headers=auth_headers,
        json={
            "items": [str(selected.id)],
            "occasion": "casual",
            "source_item_id": str(source.id),
        },
    )

    assert response.status_code == 201, response.text
    assert [item["id"] for item in response.json()["items"]] == [str(selected.id)]
    stored = await db_session.get(Outfit, UUID(response.json()["id"]))
    assert stored.source_item_id == source.id
