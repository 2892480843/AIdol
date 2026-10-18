"""Multi-piece try-on contract tests: no live provider, database, Redis or migration."""

import base64
import hashlib
import json
from datetime import UTC, datetime
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from PIL import Image
from sqlalchemy import Delete, Insert, Select, Update
from sqlalchemy.dialects import postgresql

from app.api import tryon as api
from app.database import get_db
from app.models.item import ClothingItem, ItemStatus
from app.models.tryon import TryOnTask
from app.services.tryon import TryOnService, cleanup_item_results, task_response
from app.storage import FileSystemStorage, StorageUnavailableError
from app.utils.auth import get_current_user


def picture(color="blue"):
    output = BytesIO()
    Image.new("RGB", (64, 96), color).save(output, format="JPEG")
    return output.getvalue()


class Result:
    def __init__(self, values):
        self.values = values

    def scalar_one_or_none(self):
        return self.values[0] if self.values else None

    def scalar_one(self):
        assert len(self.values) == 1
        return self.values[0]

    def scalars(self):
        return self

    def all(self):
        return self.values


class MemoryDB:
    """Execute the actual SQLAlchemy statement shape without opening any connections."""

    def __init__(self, items=()):
        self.items = {item.id: item for item in items}
        self.tasks = {}
        self.commits = 0
        self.item_locks = []
        self.deleted = []
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        params = statement.compile(dialect=postgresql.dialect()).params
        if isinstance(statement, Select):
            entity = statement.column_descriptions[0]["entity"]
            if entity is ClothingItem:
                ids = params.get("id_1", list(self.items))
                ids = [ids] if isinstance(ids, UUID) else ids
                rows = [
                    item
                    for item in self.items.values()
                    if item.id in ids and item.user_id == params["user_id_1"]
                ]
                sql = str(statement.compile(dialect=postgresql.dialect()))
                if "FOR UPDATE" in sql:
                    assert "ORDER BY clothing_items.id" in sql, (
                        "Multi-item locks need a stable order"
                    )
                    rows.sort(key=lambda item: item.id)
                    self.item_locks.append([item.id for item in rows])
                return Result(rows)
            assert entity is TryOnTask
            rows = [task for task in self.tasks.values() if task.user_id == params["user_id_1"]]
            if "idempotency_key_1" in params:
                rows = [
                    task for task in rows if task.idempotency_key == params["idempotency_key_1"]
                ]
            elif "id_1" in params:
                rows = [task for task in rows if task.id == params["id_1"]]
            elif "item_id_1" in params:
                secondary = params.get("item_ids_1", [])
                rows = [
                    task
                    for task in rows
                    if task.item_id == params["item_id_1"]
                    or any(value in (task.item_ids or []) for value in secondary)
                ]
            return Result(rows)
        if isinstance(statement, Insert):
            values = {
                column.key if hasattr(column, "key") else column: value.value
                for column, value in statement._values.items()
            }
            task = TryOnTask(**values, created_at=datetime.now(UTC), updated_at=datetime.now(UTC))
            self.tasks[task.id] = task
            return Result([task.id])
        if isinstance(statement, Update):
            task = self.tasks.get(params["id_1"])
            if task is None or task.user_id != params["user_id_1"] or task.status != "processing":
                return Result([])
            for column, value in statement._values.items():
                setattr(task, column.key if hasattr(column, "key") else column, value.value)
            return Result([task.id])
        if isinstance(statement, Delete):
            task = self.tasks.get(params["id_1"])
            if task is not None and task.user_id == params["user_id_1"]:
                await self.delete(task)
            return Result([])
        raise AssertionError(type(statement))

    async def delete(self, task):
        self.deleted.append(task.id)
        self.tasks.pop(task.id, None)

    async def commit(self):
        self.commits += 1


@pytest.fixture
def owned_service(tmp_path):
    settings = SimpleNamespace(
        tryon_enabled=True,
        ai_internal_enabled=True,
        tryon_model="Doubao-Seedream-5.0-lite",
        tryon_timeout_seconds=90,
        ai_base_url="https://provider.invalid/v1",
        ai_api_key="offline-test-only",
        max_image_megapixels=20,
    )
    service = TryOnService(settings=settings, storage=FileSystemStorage(tmp_path))
    owner = uuid4()
    items = []
    for index, (kind, color) in enumerate(
        [("t-shirt", "blue"), ("pants", "green"), ("coat", "brown"), ("sneakers", "white")], 1
    ):
        item = ClothingItem(
            id=UUID(int=index),
            user_id=owner,
            type=kind,
            status=ItemStatus.ready,
            image_path=f"{owner}/{index}.jpg",
            is_archived=False,
            wears_since_wash=0,
        )
        service.storage.write(item.image_path, picture(color), "image/jpeg")
        items.append(item)
    calls = []

    def handler(request):
        calls.append(json.loads(request.content))
        return httpx.Response(
            200, json={"data": [{"b64_json": base64.b64encode(picture("purple")).decode()}]}
        )

    service.transport = httpx.MockTransport(handler)
    return owner, items, service, calls


@pytest.mark.asyncio
async def test_capability_advertises_four_items_and_five_explicit_slots(owned_service):
    _, _, service, _ = owned_service
    cap = service.capabilities()
    assert cap.max_items == 4
    assert cap.supported_categories == ["tops", "bottoms", "dresses", "outerwear", "shoes"]
    assert {"t-shirt", "pants", "dress", "coat", "sneakers"} <= set(cap.supported_item_types)
    assert "accessories" not in cap.supported_item_types


@pytest.mark.asyncio
async def test_multipart_accepts_json_ids_and_returns_all_selected_garments(
    owned_service, monkeypatch
):
    owner, items, service, calls = owned_service
    db = MemoryDB(items)
    app = FastAPI()
    app.include_router(api.router, prefix="/api/v1")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=owner)
    app.dependency_overrides[api.get_tryon_service] = lambda: service

    async def no_rate_limit(*args, **kwargs):
        return None

    monkeypatch.setattr(api, "rate_limit_by_user", no_rate_limit)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/tryon/tasks",
            headers={"Idempotency-Key": "new-outfit"},
            data={"item_ids": json.dumps([str(item.id) for item in items]), "consent": "true"},
            files={"person_image": ("person.jpg", picture(), "image/jpeg")},
        )
    assert response.status_code == 202, response.text
    assert response.json()["item_id"] == str(items[0].id)
    assert response.json()["item_ids"] == [str(item.id) for item in items]
    assert len(calls) == 1
    assert len(calls[0]["image"]) == 2
    assert "offline-test-only" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind", ["legacy", "matching", "mismatch", "bad_json", "null_json", "no_ids", "no_consent"]
)
async def test_multipart_preserves_legacy_and_rejects_conflicting_fields(
    owned_service, monkeypatch, kind
):
    owner, items, service, calls = owned_service
    db = MemoryDB(items)
    app = FastAPI()
    app.include_router(api.router, prefix="/api/v1")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=owner)
    app.dependency_overrides[api.get_tryon_service] = lambda: service

    async def no_rate_limit(*args, **kwargs):
        return None

    monkeypatch.setattr(api, "rate_limit_by_user", no_rate_limit)
    data = {"consent": "true", "item_id": str(items[0].id)}
    if kind == "matching":
        data["item_ids"] = json.dumps([str(items[0].id), str(items[1].id)])
    elif kind == "mismatch":
        data["item_ids"] = json.dumps([str(items[1].id)])
    elif kind == "bad_json":
        data["item_ids"] = "{"
    elif kind == "null_json":
        data["item_ids"] = "null"
    elif kind == "no_ids":
        del data["item_id"]
    elif kind == "no_consent":
        data["consent"] = "false"
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/tryon/tasks",
            headers={"Idempotency-Key": kind},
            data=data,
            files={"person_image": ("person.jpg", picture(), "image/jpeg")},
        )
    if kind in {"legacy", "matching"}:
        assert response.status_code == 202, response.text
        assert response.json()["item_ids"][0] == str(items[0].id)
        assert len(calls) == 1
    else:
        assert response.status_code == 422
        assert calls == []
        assert db.tasks == {}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "slot_type,expected_slot",
    [("pants", "bottoms"), ("dress", "dresses"), ("coat", "outerwear"), ("sneakers", "shoes")],
)
async def test_one_reference_can_use_each_new_category(owned_service, slot_type, expected_slot):
    owner, items, service, calls = owned_service
    items[0].type = slot_type
    task = await service.submit(
        MemoryDB(items), owner, items[0].id, picture(), "image/jpeg", "single-new-slot"
    )
    assert task.status == "succeeded"
    assert len(calls[0]["image"]) == 2
    assert expected_slot in calls[0]["prompt"]


@pytest.mark.asyncio
async def test_dress_with_outerwear_and_shoes_is_a_supported_outfit(owned_service):
    owner, items, service, calls = owned_service
    items[0].type = "dress"
    ids = [items[0].id, items[2].id, items[3].id]
    task = await service.submit(
        MemoryDB(items), owner, ids[0], picture(), "image/jpeg", "dress-outfit", item_ids=ids
    )
    assert task.status == "succeeded"
    assert task.item_ids == [str(value) for value in ids]
    assert len(calls[0]["image"]) == 2


@pytest.mark.asyncio
async def test_multiple_garments_keep_reference_assignments_while_locks_are_sorted(owned_service):
    owner, items, service, calls = owned_service
    requested = list(reversed(items))
    db = MemoryDB(items)
    task = await service.submit(
        db,
        owner,
        requested[0].id,
        picture(),
        "image/jpeg",
        "ordered",
        item_ids=[item.id for item in requested],
    )
    assert task.status == "succeeded"
    assert task_response(task).item_ids == [item.id for item in requested]
    assert all(locked == sorted(locked) for locked in db.item_locks)
    assert db.commits >= 2
    body = calls[0]
    for position, slot in [
        ("bottom-right", "shoes"),
        ("bottom-left", "outerwear"),
        ("top-right", "bottoms"),
        ("top-left", "tops"),
    ]:
        assert position in body["prompt"].lower()
        assert slot in body["prompt"]
    assert body["watermark"] is True
    assert body["sequential_image_generation"] == "disabled"
    assert body["response_format"] == "b64_json"
    assert "output_format" not in body
    with Image.open(BytesIO(base64.b64decode(body["image"][1].split(",")[1]))) as image:
        assert image.size == (2048, 2048)
        assert all(value > 240 for value in image.getpixel((1536, 1580)))
        assert image.getpixel((512, 556))[2] > 200


@pytest.mark.asyncio
async def test_single_item_keeps_legacy_hash_two_argument_generate_and_response_fallback(
    owned_service, monkeypatch
):
    owner, items, service, calls = owned_service
    db = MemoryDB(items)
    person = picture("green")
    seen = []

    async def legacy_generate(person_data, garment_data):
        seen.append((person_data, garment_data))
        return picture()

    monkeypatch.setattr(service, "generate", legacy_generate)
    task = await service.submit(db, owner, items[0].id, person, "image/jpeg", "legacy")
    assert (
        task.request_hash == hashlib.sha256(str(items[0].id).encode() + b"\0" + person).hexdigest()
    )
    assert len(seen) == 1
    task.item_ids = None
    assert task_response(task).item_ids == [items[0].id]
    assert calls == []


@pytest.mark.asyncio
async def test_repeated_outfit_intent_generates_once_and_changed_selection_conflicts(owned_service):
    owner, items, service, calls = owned_service
    db = MemoryDB(items)
    args = (db, owner, items[0].id, picture(), "image/jpeg", "same-intent")
    first = await service.submit(*args, item_ids=[item.id for item in items])
    assert (await service.submit(*args, item_ids=[item.id for item in items])).id == first.id
    with pytest.raises(HTTPException) as error:
        await service.submit(*args, item_ids=[item.id for item in items[:2]])
    assert error.value.status_code == 409
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid",
    [
        [],
        ["not-a-uuid"],
        [None],
        [1],
        [str(UUID(int=1))] * 2,
        [str(UUID(int=i)) for i in range(1, 6)],
        "bad",
        {"id": str(UUID(int=1))},
    ],
)
async def test_json_id_contract_rejects_invalid_lists_without_generation(
    owned_service, monkeypatch, invalid
):
    owner, items, service, calls = owned_service
    db = MemoryDB(items)
    app = FastAPI()
    app.include_router(api.router, prefix="/api/v1")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=owner)
    app.dependency_overrides[api.get_tryon_service] = lambda: service

    async def no_rate_limit(*args, **kwargs):
        return None

    monkeypatch.setattr(api, "rate_limit_by_user", no_rate_limit)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/tryon/tasks",
            headers={"Idempotency-Key": "bad"},
            data={"item_ids": json.dumps(invalid), "consent": "true"},
            files={"person_image": ("person.jpg", picture(), "image/jpeg")},
        )
    assert response.status_code == 422
    assert calls == []
    assert db.tasks == {}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "problem",
    [
        "same_slot",
        "dress_top",
        "dress_bottom",
        "dirty",
        "processing",
        "archived",
        "foreign",
        "unsupported",
        "missing",
    ],
)
async def test_every_reference_is_validated_before_provider(owned_service, problem):
    owner, items, service, calls = owned_service
    db = MemoryDB(items)
    ids = [item.id for item in items[:2]]
    if problem == "same_slot":
        items[1].type = "shirt"
    elif problem in {"dress_top", "dress_bottom"}:
        items[2].type = "dress"
        ids = [items[2].id, items[0 if problem == "dress_top" else 1].id]
    elif problem == "dirty":
        items[1].needs_wash = True
    elif problem == "processing":
        items[1].status = ItemStatus.processing
    elif problem == "archived":
        items[1].is_archived = True
    elif problem == "foreign":
        items[1].user_id = uuid4()
    elif problem == "unsupported":
        items[1].type = "accessories"
    else:
        del db.items[items[1].id]
    with pytest.raises(HTTPException) as error:
        await service.submit(db, owner, ids[0], picture(), "image/jpeg", problem, item_ids=ids)
    assert error.value.status_code in {404, 422}
    assert calls == []
    assert db.tasks == {}


@pytest.mark.asyncio
async def test_secondary_source_deletion_cleans_private_result_and_task(owned_service):
    owner, items, service, _ = owned_service
    db = MemoryDB(items)
    task = await service.submit(
        db,
        owner,
        items[0].id,
        picture(),
        "image/jpeg",
        "cleanup",
        item_ids=[item.id for item in items],
    )
    assert service.storage.exists(task.result_path)
    await cleanup_item_results(db, items[1], storage=service.storage)
    assert task.id not in db.tasks
    assert not service.storage.exists(task.result_path)
    query = next(
        statement for statement in reversed(db.statements) if isinstance(statement, Select)
    )
    assert "@>" in str(query.compile(dialect=postgresql.dialect()))


@pytest.mark.asyncio
async def test_secondary_source_deleted_during_generation_cannot_leave_an_output_or_task(
    owned_service, monkeypatch
):
    owner, items, service, _ = owned_service
    db = MemoryDB(items)

    async def generate(*args, **kwargs):
        del db.items[items[1].id]
        return picture()

    monkeypatch.setattr(service, "generate", generate)
    with pytest.raises(HTTPException) as error:
        await service.submit(
            db,
            owner,
            items[0].id,
            picture(),
            "image/jpeg",
            "deleted",
            item_ids=[item.id for item in items],
        )
    assert error.value.status_code == 404
    assert db.tasks == {}
    assert list(service.storage.root.glob("tryon/**/*.jpg")) == []


@pytest.mark.asyncio
async def test_cleanup_failure_preserves_tracked_task(owned_service, monkeypatch):
    owner, items, service, _ = owned_service
    db = MemoryDB(items)
    task = await service.submit(
        db,
        owner,
        items[0].id,
        picture(),
        "image/jpeg",
        "cleanup-fail",
        item_ids=[item.id for item in items],
    )

    def denied(path):
        raise StorageUnavailableError("private storage detail")

    monkeypatch.setattr(service.storage, "delete", denied)
    with pytest.raises(HTTPException) as error:
        await cleanup_item_results(db, items[2], storage=service.storage)
    assert error.value.status_code == 503
    assert "private storage detail" not in str(error.value.detail)
    assert task.id in db.tasks
    assert db.deleted == []


@pytest.mark.asyncio
async def test_partial_result_storage_failure_cleans_the_object_and_keeps_safe_failure(
    owned_service, monkeypatch
):
    owner, items, service, calls = owned_service
    db = MemoryDB(items)
    write = service.storage.write

    def partly_written(path, content, content_type):
        write(path, content, content_type)
        raise StorageUnavailableError("private object detail")

    monkeypatch.setattr(service.storage, "write", partly_written)
    task = await service.submit(
        db,
        owner,
        items[0].id,
        picture(),
        "image/jpeg",
        "partial-write",
        item_ids=[item.id for item in items],
    )
    assert task.status == "failed"
    assert task.error_code == "result_storage_unavailable"
    assert task.result_path is None
    assert list(service.storage.root.glob("tryon/**/*.jpg")) == []
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_failed_compensation_retains_a_private_cleanup_reference(owned_service, monkeypatch):
    owner, items, service, _ = owned_service
    db = MemoryDB(items)
    write, delete_object = service.storage.write, service.storage.delete

    def partly_written(path, content, content_type):
        write(path, content, content_type)
        raise StorageUnavailableError("private write detail")

    def cannot_delete(path):
        raise StorageUnavailableError("private cleanup detail")

    monkeypatch.setattr(service.storage, "write", partly_written)
    monkeypatch.setattr(service.storage, "delete", cannot_delete)
    task = await service.submit(
        db,
        owner,
        items[0].id,
        picture(),
        "image/jpeg",
        "failed-compensation",
        item_ids=[item.id for item in items],
    )
    assert task.status == "failed"
    assert task.result_path == f"tryon/{owner}/{task.id}.jpg"
    assert service.storage.exists(task.result_path)
    assert task_response(task).result_url is None
    monkeypatch.setattr(service.storage, "delete", delete_object)
    await cleanup_item_results(db, items[1], storage=service.storage)
    assert task.id not in db.tasks
    assert not service.storage.exists(task.result_path)


@pytest.mark.asyncio
@pytest.mark.parametrize("foreign", [False, True])
async def test_bulk_delete_prelocks_every_selected_owned_item_before_deleting_any_files(
    owned_service, monkeypatch, foreign
):
    from app.api import items as items_api

    owner, items, _, _ = owned_service
    db = MemoryDB(items)
    selected = [items[1].id, items[0].id]
    if foreign:
        items[1].user_id = uuid4()
    expected = sorted(item.id for item in items[:2] if item.user_id == owner)
    deleted = []
    cursor = uuid4()

    async def resolve(*args, **kwargs):
        return selected, cursor, True

    class FakeItemService:
        def __init__(self, session):
            assert session is db

        async def get_by_id(self, item_id, user_id):
            value = db.items.get(item_id)
            return value if value is not None and value.user_id == user_id else None

        async def delete(self, item, **kwargs):
            assert db.item_locks and db.item_locks[0] == expected
            deleted.append(item.id)

    monkeypatch.setattr(items_api, "_resolve_bulk_item_ids", resolve)
    monkeypatch.setattr(items_api, "ItemService", FakeItemService)
    monkeypatch.setattr(items_api, "ImageService", lambda: object())
    result = await items_api.bulk_delete_items(
        items_api.BulkDeleteRequest(item_ids=selected), db, SimpleNamespace(id=owner)
    )
    assert result.deleted == len(expected)
    assert result.failed == len(selected) - len(expected)
    assert set(deleted) == set(expected)
    assert result.next_cursor == cursor
    assert result.has_more is True


@pytest.mark.asyncio
async def test_cleanup_uses_the_private_deterministic_key_when_db_metadata_was_not_saved(
    owned_service,
):
    owner, items, service, _ = owned_service
    db = MemoryDB(items)
    task = await service.submit(
        db,
        owner,
        items[0].id,
        picture(),
        "image/jpeg",
        "lost-metadata",
        item_ids=[item.id for item in items],
    )
    expected = task.result_path
    task.result_path = None
    assert service.storage.exists(expected)
    await cleanup_item_results(db, items[2], storage=service.storage)
    assert task.id not in db.tasks
    assert not service.storage.exists(expected)
