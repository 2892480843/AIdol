"""Private, explicitly requested image editing never replays a paid submission."""

import asyncio
import base64
from datetime import UTC, datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import ClothingItem, ItemStatus


def picture(color="blue", fmt="JPEG", size=(160, 240)):
    output = BytesIO()
    Image.new("RGB", size, color).save(output, format=fmt)
    return output.getvalue()


def test_default_model_matches_verified_relay_output_format_capability():
    from app.config import Settings

    assert Settings.model_fields["tryon_model"].default == "Doubao-Seedream-5.0-lite"


@pytest.mark.asyncio
async def test_capabilities_require_authentication(client):
    assert (await client.get("/api/v1/tryon/capabilities")).status_code == 401


@pytest.fixture
def tryon_service(tmp_path):
    from app.api.tryon import get_tryon_service
    from app.main import app
    from app.services.tryon import TryOnService
    from app.storage import FileSystemStorage

    settings = SimpleNamespace(
        tryon_enabled=True,
        tryon_model="Doubao-Seedream-5.0-lite",
        tryon_timeout_seconds=90,
        ai_base_url="https://provider.invalid/v1",
        ai_api_key="private-test-key",
        max_image_megapixels=20,
    )
    service = TryOnService(settings=settings, storage=FileSystemStorage(tmp_path))
    app.dependency_overrides[get_tryon_service] = lambda: service
    yield service
    app.dependency_overrides.pop(get_tryon_service, None)


@pytest.fixture
async def top(db_session, test_user, tryon_service):
    item = ClothingItem(
        user_id=test_user.id,
        type="shirt",
        status=ItemStatus.ready,
        image_path=f"{test_user.id}/processed.jpg",
        original_image_path=f"{test_user.id}/original.jpg",
    )
    tryon_service.storage.write(item.image_path, picture("red"), "image/jpeg")
    tryon_service.storage.write(item.original_image_path, picture("blue"), "image/jpeg")
    db_session.add(item)
    await db_session.commit()
    return item


def submission(item_id, key=None, photo=None, **extra):
    return {
        "headers": {"Idempotency-Key": key or str(uuid4())},
        "data": {"item_id": str(item_id), "consent": "true", **extra},
        "files": {"person_image": ("person.jpg", photo or picture("green"), "image/jpeg")},
    }


async def submit(client, headers, item_id, **kwargs):
    args = submission(item_id, **kwargs)
    args["headers"].update(headers)
    return await client.post("/api/v1/tryon/tasks", **args)


@pytest.mark.asyncio
async def test_missing_configuration_is_explicit_and_never_calls_provider(
    client, auth_headers, tryon_service, monkeypatch
):
    tryon_service.settings.ai_api_key = None
    called = []
    monkeypatch.setattr(tryon_service, "generate", lambda *args: called.append(args))
    capabilities = (await client.get("/api/v1/tryon/capabilities", headers=auth_headers)).json()
    assert capabilities["provider"] == "seedream"
    assert capabilities["configured"] is False
    assert capabilities["available"] is False
    assert capabilities["reason"] == "not_configured"
    assert capabilities["max_items"] == 4
    assert capabilities["supported_categories"] == ["tops", "bottoms", "dresses", "outerwear", "shoes"]
    response = await submit(client, auth_headers, uuid4())
    assert response.status_code == 503
    assert not called


@pytest.mark.asyncio
@pytest.mark.parametrize("switch", ["tryon_enabled", "ai_internal_enabled"])
async def test_disabled_capability_respects_both_server_switches(
    client, auth_headers, tryon_service, switch
):
    setattr(tryon_service.settings, switch, False)
    response = await client.get("/api/v1/tryon/capabilities", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["configured"] is True
    assert response.json()["enabled"] is False
    assert response.json()["available"] is False
    assert response.json()["reason"] == "disabled"


@pytest.mark.asyncio
async def test_intent_commits_before_single_provider_call_and_result_is_private(
    client, auth_headers, db_session, test_user, top, tryon_service, monkeypatch
):
    from app.models.tryon import TryOnTask

    calls = []

    async def generate(person, garment):
        async with AsyncSession(bind=db_session.bind) as observer:
            task = (
                await observer.execute(
                    select(TryOnTask).where(TryOnTask.user_id == test_user.id)
                )
            ).scalar_one()
            assert task.status == "processing"
        with Image.open(BytesIO(garment)) as image:
            assert image.getpixel((0, 0))[2] > 200  # The owned original, not red preview.
        calls.append(1)
        return picture("purple")

    monkeypatch.setattr(tryon_service, "generate", generate)
    key = str(uuid4())
    response = await submit(client, auth_headers, top.id, key=key)
    assert response.status_code == 202, response.text
    task = response.json()
    assert task["status"] == "succeeded"
    assert task["result_url"] == f"/api/v1/tryon/tasks/{task['id']}/image"
    assert "private-test-key" not in response.text
    assert "provider.invalid" not in response.text
    image = await client.get(task["result_url"], headers=auth_headers)
    assert image.status_code == 200
    assert image.headers["cache-control"] == "private, no-store"
    assert image.headers["content-type"] == "image/jpeg"
    assert (await client.get(task["result_url"])).status_code == 401
    again = await submit(client, auth_headers, top.id, key=key)
    assert again.status_code == 202
    assert again.json()["id"] == task["id"]
    assert len(calls) == 1
    listing = (await client.get("/api/v1/tryon/tasks", headers=auth_headers)).json()
    assert [entry["id"] for entry in listing["items"]] == [task["id"]]


@pytest.mark.asyncio
async def test_idempotency_rejects_changed_photo_or_item(
    client, auth_headers, top, tryon_service, monkeypatch
):
    async def generate(*args):
        return picture()

    monkeypatch.setattr(tryon_service, "generate", generate)
    key = str(uuid4())
    assert (await submit(client, auth_headers, top.id, key=key)).status_code == 202
    changed = await submit(client, auth_headers, top.id, key=key, photo=picture("yellow"))
    assert changed.status_code == 409
    assert (await submit(client, auth_headers, uuid4(), key=key)).status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "item_type,status,archived,needs_wash",
    [
        ("accessories", ItemStatus.ready, False, False),
        ("shirt", ItemStatus.processing, False, False),
        ("shirt", ItemStatus.archived, False, False),
        ("shirt", ItemStatus.ready, True, False),
        ("shirt", ItemStatus.ready, False, True),
    ],
)
async def test_only_ready_owned_supported_garment_can_be_submitted(
    client, auth_headers, db_session, top, tryon_service, monkeypatch, item_type, status, archived, needs_wash
):
    top.type, top.status, top.is_archived, top.needs_wash = item_type, status, archived, needs_wash
    await db_session.commit()
    called = []
    monkeypatch.setattr(tryon_service, "generate", lambda *args: called.append(args))
    response = await submit(client, auth_headers, top.id)
    assert response.status_code == 422
    assert not called


@pytest.mark.asyncio
async def test_family_or_other_owner_items_and_results_are_inaccessible(
    client, auth_headers, db_session, test_user, top, tryon_service, monkeypatch
):
    from app.models.family import Family
    from app.models.tryon import TryOnTask
    from app.models.user import User

    other = User(
        id=uuid4(),
        external_id=str(uuid4()),
        email=f"{uuid4()}@example.com",
        display_name="Other",
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()
    family = Family(
        name="Private try-on family", created_by=test_user.id, invite_code=uuid4().hex[:16]
    )
    db_session.add(family)
    await db_session.flush()
    test_user.family_id = family.id
    other.family_id = family.id
    top.user_id = other.id
    task = TryOnTask(
        user_id=other.id,
        item_id=top.id,
        idempotency_key=str(uuid4()),
        request_hash="x" * 64,
        provider="seedream",
        model="test",
        status="succeeded",
        result_path=f"tryon/{other.id}/{uuid4()}.jpg",
    )
    db_session.add(task)
    await db_session.commit()
    called = []
    monkeypatch.setattr(tryon_service, "generate", lambda *args: called.append(args))
    assert (await submit(client, auth_headers, top.id)).status_code == 404
    assert (await client.get(f"/api/v1/tryon/tasks/{task.id}", headers=auth_headers)).status_code == 404
    assert (await client.get(f"/api/v1/tryon/tasks/{task.id}/image", headers=auth_headers)).status_code == 404
    listing = (await client.get("/api/v1/tryon/tasks", headers=auth_headers)).json()
    assert listing["items"] == []
    assert not called


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["no_consent", "invalid", "too_large", "wrong_format", "too_many_pixels"])
async def test_person_input_is_validated_before_provider(
    client, auth_headers, top, tryon_service, monkeypatch, kind
):
    args = submission(top.id)
    args["headers"].update(auth_headers)
    if kind == "no_consent":
        args["data"]["consent"] = "false"
    elif kind == "invalid":
        args["files"]["person_image"] = ("person.jpg", b"not an image", "image/jpeg")
    elif kind == "too_large":
        args["files"]["person_image"] = ("person.jpg", b"x" * (10 * 1024 * 1024 + 1), "image/jpeg")
    elif kind == "wrong_format":
        args["files"]["person_image"] = ("person.gif", picture(fmt="GIF"), "image/gif")
    else:
        args["files"]["person_image"] = ("person.png", picture(fmt="PNG", size=(5000, 5000)), "image/png")
    called = []
    monkeypatch.setattr(tryon_service, "generate", lambda *args: called.append(args))
    result = await client.post("/api/v1/tryon/tasks", **args)
    assert result.status_code in (413, 415, 422)
    assert not called


@pytest.mark.asyncio
async def test_timeout_is_unknown_and_idempotent_replay_does_not_charge_again(
    client, auth_headers, top, tryon_service, monkeypatch
):
    calls = []

    async def generate(*args):
        calls.append(1)
        raise httpx.ReadTimeout("DO NOT LOG private-test-key https://provider.invalid/person")

    monkeypatch.setattr(tryon_service, "generate", generate)
    key = str(uuid4())
    first = await submit(client, auth_headers, top.id, key=key)
    assert first.status_code == 202
    assert first.json()["status"] == "failed"
    assert first.json()["error_code"] == "submission_unknown"
    assert "private-test-key" not in first.text
    again = await submit(client, auth_headers, top.id, key=key)
    assert again.json()["id"] == first.json()["id"]
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_refresh_marks_interrupted_intent_without_replaying_generation(
    client, auth_headers, db_session, test_user, top, tryon_service, monkeypatch
):
    from app.models.tryon import TryOnTask

    task = TryOnTask(
        user_id=test_user.id,
        item_id=top.id,
        idempotency_key=str(uuid4()),
        request_hash="x" * 64,
        provider="seedream",
        model="test",
        status="processing",
        updated_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    db_session.add(task)
    await db_session.commit()
    called = []
    monkeypatch.setattr(tryon_service, "generate", lambda *args: called.append(args))
    response = await client.get(f"/api/v1/tryon/tasks/{task.id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert response.json()["error_code"] == "submission_unknown"
    assert not called


@pytest.mark.asyncio
async def test_concurrent_same_intent_calls_provider_once(
    client, auth_headers, db_session, top, tryon_service, monkeypatch
):
    from app.database import get_db
    from app.main import app

    # Real independent sessions: sharing one fixture session would not model two requests.
    async def independent_db():
        async with AsyncSession(bind=db_session.bind, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_db] = independent_db
    started, release = asyncio.Event(), asyncio.Event()
    calls = []

    async def generate(*args):
        calls.append(1)
        started.set()
        await release.wait()
        return picture()

    monkeypatch.setattr(tryon_service, "generate", generate)
    key = str(uuid4())
    first = asyncio.create_task(submit(client, auth_headers, top.id, key=key))
    await asyncio.wait_for(started.wait(), timeout=5)
    second = await submit(client, auth_headers, top.id, key=key)
    assert second.status_code == 202
    assert second.json()["status"] == "processing"
    release.set()
    completed = await first
    assert completed.json()["id"] == second.json()["id"]
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_deleting_source_during_generation_does_not_recreate_task_or_keep_output(
    client, auth_headers, db_session, top, tryon_service, monkeypatch
):
    from sqlalchemy import delete

    from app.models.tryon import TryOnTask

    async def generate(*args):
        async with AsyncSession(bind=db_session.bind) as other:
            await other.execute(delete(ClothingItem).where(ClothingItem.id == top.id))
            await other.commit()
        return picture()

    monkeypatch.setattr(tryon_service, "generate", generate)
    response = await submit(client, auth_headers, top.id)
    assert response.status_code == 404
    assert (await db_session.execute(select(TryOnTask).where(TryOnTask.item_id == top.id))).scalars().all() == []
    assert list(tryon_service.storage.root.glob("tryon/**/*.jpg")) == []


@pytest.mark.asyncio
async def test_metadata_is_removed_from_person_before_provider(
    client, auth_headers, top, tryon_service, monkeypatch
):
    image = Image.new("RGB", (160, 240), "green")
    exif = Image.Exif()
    exif[270] = "private-location-not-for-provider"
    output = BytesIO()
    image.save(output, "JPEG", exif=exif)
    seen = []

    async def generate(person, garment):
        with Image.open(BytesIO(person)) as normalized:
            assert not normalized.getexif()
        seen.append(1)
        return picture()

    monkeypatch.setattr(tryon_service, "generate", generate)
    response = await submit(client, auth_headers, top.id, photo=output.getvalue())
    assert response.status_code == 202
    assert seen == [1]


@pytest.mark.asyncio
@pytest.mark.parametrize("bulk", [False, True])
async def test_source_deletion_removes_all_completed_private_result_images(
    client, auth_headers, db_session, top, tryon_service, monkeypatch, bulk
):
    from app.models.tryon import TryOnTask
    from app.services.image_service import ImageService

    async def generate(*args):
        return picture("purple")

    monkeypatch.setattr(tryon_service, "generate", generate)
    monkeypatch.setattr("app.api.items.ImageService", lambda: ImageService(storage=tryon_service.storage))
    for _ in range(2):
        assert (await submit(client, auth_headers, top.id)).json()["status"] == "succeeded"
    assert len(list(tryon_service.storage.root.glob("tryon/**/*.jpg"))) == 2
    item_id = top.id
    if bulk:
        response = await client.post("/api/v1/items/bulk/delete", json={"item_ids": [str(item_id)]}, headers=auth_headers)
        assert response.status_code == 200, response.text
        assert response.json()["deleted"] == 1
    else:
        response = await client.delete(f"/api/v1/items/{item_id}", headers=auth_headers)
        assert response.status_code == 204, response.text
    assert list(tryon_service.storage.root.glob("tryon/**/*.jpg")) == []
    assert (await db_session.execute(select(TryOnTask).where(TryOnTask.item_id == item_id))).scalars().all() == []


@pytest.mark.asyncio
@pytest.mark.parametrize("bulk", [False, True])
async def test_result_cleanup_failure_preserves_database_paths_and_clothing_images(
    client, auth_headers, db_session, top, tryon_service, monkeypatch, bulk
):
    from app.models.tryon import TryOnTask
    from app.services.image_service import ImageService
    from app.storage import StorageUnavailableError

    async def generate(*args):
        return picture("purple")

    monkeypatch.setattr(tryon_service, "generate", generate)
    monkeypatch.setattr("app.api.items.ImageService", lambda: ImageService(storage=tryon_service.storage))
    task = (await submit(client, auth_headers, top.id)).json()
    task_id, item_id, original_path = task["id"], top.id, top.original_image_path
    delete = tryon_service.storage.delete

    def failing_delete(key):
        if key.startswith("tryon/"):
            raise StorageUnavailableError("private provider detail must not appear")
        return delete(key)

    monkeypatch.setattr(tryon_service.storage, "delete", failing_delete)
    if bulk:
        response = await client.post("/api/v1/items/bulk/delete", json={"item_ids": [str(item_id)]}, headers=auth_headers)
    else:
        response = await client.delete(f"/api/v1/items/{item_id}", headers=auth_headers)
    assert response.status_code == 503, response.text
    assert "private provider detail" not in response.text
    await db_session.rollback()
    saved = (await db_session.execute(select(TryOnTask).where(TryOnTask.id == task_id))).scalar_one()
    assert saved.result_path == f"tryon/{saved.user_id}/{task_id}.jpg"
    assert tryon_service.storage.exists(saved.result_path)
    assert tryon_service.storage.exists(original_path)
    assert await db_session.get(ClothingItem, item_id) is not None


@pytest.mark.asyncio
async def test_seedream_transport_uses_only_two_data_images_and_strict_base64(
    tryon_service, caplog
):
    observed = []

    def handler(request):
        import json

        body = json.loads(request.content)
        observed.append(body)
        assert request.url.path == "/v1/images/generations"
        assert body["model"] == "Doubao-Seedream-5.0-lite"
        assert "output_format" not in body
        assert len(body["image"]) == 2
        assert all(image.startswith("data:image/jpeg;base64,") for image in body["image"])
        assert body["response_format"] == "b64_json"
        assert body["sequential_image_generation"] == "disabled"
        return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(picture()).decode()}]})

    tryon_service.transport = httpx.MockTransport(handler)
    result = await tryon_service.generate(picture("green"), picture("blue"))
    assert Image.open(BytesIO(result)).format == "JPEG"
    assert len(observed) == 1
    assert "private-test-key" not in caplog.text
    assert "data:image" not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        {"data": [{"url": "http://localhost/private"}]},
        {"data": [{"b64_json": "bad%%"}]},
        {"data": [{"b64_json": base64.b64encode(b"not pixels").decode()}]},
        {"code": 500, "data": None},
    ],
)
async def test_invalid_or_url_provider_output_is_not_fetched(tryon_service, body):
    from app.services.tryon import TryOnProviderError

    seen = []

    def handler(request):
        seen.append(request.url.path)
        return httpx.Response(200, json=body)

    tryon_service.transport = httpx.MockTransport(handler)
    with pytest.raises(TryOnProviderError):
        await tryon_service.generate(picture(), picture())
    assert seen == ["/v1/images/generations"]


@pytest.mark.asyncio
async def test_one_complete_sse_image_envelope_is_unwrapped_without_resubmission(tryon_service):
    import json

    calls = []
    envelope = {"data": [{"b64_json": base64.b64encode(picture()).decode()}]}

    def handler(request):
        calls.append(request.url.path)
        body = "event: message\r\ndata: " + json.dumps(envelope) + "\r\n\r\ndata: [DONE]\r\n\r\n"
        return httpx.Response(200, text=body, headers={"content-type": "text/event-stream; charset=utf-8"})

    tryon_service.transport = httpx.MockTransport(handler)
    result = await tryon_service.generate(picture(), picture())
    assert Image.open(BytesIO(result)).format == "JPEG"
    assert calls == ["/v1/images/generations"]


@pytest.mark.asyncio
@pytest.mark.parametrize("error_fields", [{"code": 500}, {"error": {"message": "private error must not escape"}}])
async def test_business_failure_is_rejected_even_with_valid_image_data(tryon_service, error_fields):
    from app.services.tryon import TryOnProviderError

    calls = []

    def handler(request):
        calls.append(request.url.path)
        return httpx.Response(200, json={**error_fields, "data": [{"b64_json": base64.b64encode(picture()).decode()}]})

    tryon_service.transport = httpx.MockTransport(handler)
    with pytest.raises(TryOnProviderError, match="^provider_rejected$"):
        await tryon_service.generate(picture(), picture())
    assert calls == ["/v1/images/generations"]


@pytest.mark.asyncio
async def test_observed_business_code_500_null_data_maps_to_safe_provider_rejection(tryon_service):
    from app.services.tryon import TryOnProviderError

    tryon_service.transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"code": 500, "data": None}))
    with pytest.raises(TryOnProviderError, match="^provider_rejected$"):
        await tryon_service.generate(picture(), picture())


@pytest.mark.asyncio
async def test_multiple_sse_image_events_are_not_mistaken_for_complete_nonstreaming_result(tryon_service):
    import json

    from app.services.tryon import TryOnProviderError

    envelope = {"data": [{"b64_json": base64.b64encode(picture()).decode()}]}
    event = "data: " + json.dumps(envelope) + "\n\n"
    tryon_service.transport = httpx.MockTransport(lambda request: httpx.Response(200, text=event + event, headers={"content-type": "text/event-stream"}))
    with pytest.raises(TryOnProviderError, match="^invalid_provider_output$"):
        await tryon_service.generate(picture(), picture())
