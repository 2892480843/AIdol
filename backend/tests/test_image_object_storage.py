from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from PIL import Image

from app.api.images import get_image
from app.models.item import ClothingItem, ItemStatus
from app.services.ai_service import AIService, ClothingTags
from app.services.image_service import VARIANTS, ImageService
from app.storage.s3 import S3Storage
from app.workers.tagging import tag_item_image
from tests.test_object_storage import FakeS3Client


def jpeg_bytes(size=(600, 400)):
    output = BytesIO()
    Image.new("RGB", size, (20, 180, 50)).save(output, format="JPEG")
    return output.getvalue()


@pytest.mark.asyncio
async def test_s3_images_keep_paths_and_variants_across_rotate_remove_restore_delete():
    storage = S3Storage(bucket="wardrobe", client=FakeS3Client())
    service = ImageService(storage=storage)
    paths = await service.process_and_store(uuid4(), jpeg_bytes(), "photo.jpg")
    original = paths["image_path"]
    original_bytes = storage.read(original)
    assert not original.startswith("/")
    for variant in VARIANTS:
        assert Image.open(BytesIO(storage.read(paths[variant.path_field]))).size == (
            min(variant.max_px, 600),
            min(round(variant.max_px * 2 / 3), 400),
        )

    provider = MagicMock()
    provider.remove.side_effect = lambda image: Image.new("RGBA", image.size, (200, 20, 20, 255))
    with patch("app.services.background_removal.get_provider", return_value=provider):
        removed = service.remove_background(original)
        service.remove_background(original)
    backup = removed["original_backup_path"]
    assert storage.read(backup) == original_bytes

    service.restore_original(original, backup)
    assert not storage.exists(backup)
    assert Image.open(BytesIO(storage.read(original))).getpixel((3, 3))[1] > 150
    service.rotate_image(original)
    assert Image.open(BytesIO(storage.read(original))).size == (400, 600)

    service.delete_images({variant.path_field: paths[variant.path_field] for variant in VARIANTS})
    assert not storage.client.objects


@pytest.mark.asyncio
async def test_s3_materialization_is_scoped_to_ai_call_and_cleanup_runs_on_error():
    storage = S3Storage(bucket="wardrobe", client=FakeS3Client())
    service = ImageService(storage=storage)
    paths = await service.process_and_store(uuid4(), jpeg_bytes(), "photo.jpg")
    reference = service.get_job_image_path(paths["image_path"])
    assert reference == f"storage://{paths['image_path']}"
    with pytest.raises(RuntimeError, match="AI failed"):
        with service.materialize_image(reference) as local_path:
            assert local_path.exists()
            assert local_path.read_bytes() == storage.read(paths["image_path"])
            raise RuntimeError("AI failed")
    assert not local_path.exists()


def test_legacy_filesystem_job_paths_stay_compatible(tmp_path):
    service = ImageService(storage_path=str(tmp_path))
    image_path = service.get_image_path("user/photo.jpg")
    image_path.parent.mkdir()
    image_path.write_bytes(jpeg_bytes())
    reference = service.get_job_image_path("user/photo.jpg")
    assert reference == str(image_path)
    with service.materialize_image(reference) as local_path:
        assert local_path == image_path
    assert image_path.exists()


def test_s3_worker_accepts_already_queued_absolute_paths_without_local_copy(tmp_path):
    storage = S3Storage(bucket="wardrobe", client=FakeS3Client())
    storage.write("user/photo.jpg", jpeg_bytes(), "image/jpeg")
    service = ImageService(storage_path=str(tmp_path), storage=storage)
    with service.materialize_image(str(tmp_path / "user/photo.jpg")) as local_path:
        assert Image.open(local_path).size == (600, 400)
    with pytest.raises(ValueError):
        with service.materialize_image("/private/secrets.jpg"):
            pass


@pytest.mark.asyncio
async def test_s3_image_api_streams_private_image_and_closes_body():
    user_id = uuid4()
    storage = S3Storage(bucket="wardrobe", client=FakeS3Client())
    service = ImageService(storage=storage)
    data = jpeg_bytes()
    storage.write(f"{user_id}/photo.jpg", data, "image/jpeg")
    with patch("app.api.images.ImageService", return_value=service):
        response = await get_image(str(user_id), "photo.jpg", None, SimpleNamespace(id=user_id))
    assert response.media_type == "image/jpeg"
    assert response.headers["cache-control"].startswith("private")
    assert response.headers["content-length"] == str(len(data))
    assert b"".join([chunk async for chunk in response.body_iterator]) == data
    assert storage.client.bodies[-1].closed


@pytest.mark.asyncio
async def test_s3_image_api_denies_access_before_contacting_storage():
    user_id = uuid4()
    storage = S3Storage(bucket="wardrobe", client=FakeS3Client())
    with patch(
        "app.api.images.ImageService", return_value=ImageService(storage=storage)
    ) as factory:
        with pytest.raises(HTTPException) as error:
            await get_image(str(user_id), "photo.jpg", None, None, None, None)
    assert error.value.status_code == 401
    factory.assert_not_called()


@pytest.mark.asyncio
async def test_s3_ai_worker_materializes_object_only_during_provider_call(db_session, test_user):
    storage = S3Storage(bucket="wardrobe", client=FakeS3Client())
    service = ImageService(storage=storage)
    paths = await service.process_and_store(test_user.id, jpeg_bytes(), "photo.jpg")
    item = ClothingItem(
        user_id=test_user.id,
        type="unknown",
        status=ItemStatus.processing,
        image_path=paths["image_path"],
    )
    db_session.add(item)
    await db_session.commit()
    downloaded = []

    async def analyze(path, *, locale):
        assert path.is_file()
        assert Image.open(path).size == (600, 400)
        downloaded.append(path)
        return ClothingTags(type="shirt", primary_color="green", confidence=0.9)

    with (
        patch("app.workers.tagging.get_db_session", return_value=db_session),
        patch.object(db_session, "close", new_callable=AsyncMock),
        patch("app.workers.tagging.ImageService", return_value=service),
        patch.object(AIService, "analyze_image", side_effect=analyze),
    ):
        result = await tag_item_image(
            {"job_try": 1}, str(item.id), service.get_job_image_path(item.image_path)
        )
    assert result["status"] == "success"
    assert len(downloaded) == 1
    assert not downloaded[0].exists()
    await db_session.refresh(item)
    assert item.status == ItemStatus.ready
