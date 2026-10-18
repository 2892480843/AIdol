"""Authenticated extraction HTTP contract; the model boundary is deterministic.

Uses the existing DB/auth fixtures. The production ONNX graph is intentionally
not needed: real-model quality is separately exercised by verify-service.py.
"""

import base64
import io
from unittest.mock import patch

import jwt
import numpy as np
import pytest
from PIL import Image
from sqlalchemy import func, select

from app.api import clothing_extraction as extraction_api
from app.config import get_settings
from app.models.item import ClothingItem
from app.services import clothing_extraction as service

URL = "/api/v1/clothing-extraction"


def _png(size=(64, 64)):
    data = io.BytesIO()
    Image.new("RGB", size, (75, 115, 165)).save(data, "PNG")
    return data.getvalue()


def _files(content=None):
    return {"image": ("outfit.png", _png() if content is None else content, "image/png")}


async def _request(client, method, headers):
    if method == "GET":
        return await client.get(URL + "/capabilities", headers=headers)
    return await client.post(URL, files=_files(), headers=headers)


@pytest.mark.parametrize("method", ["GET", "POST"])
@pytest.mark.parametrize("auth_mode", ["missing", "invalid", "expired"])
async def test_authentication_blocks_model_access(client, test_user, method, auth_mode):
    headers = {}
    if auth_mode == "invalid":
        headers = {"Authorization": "Bearer invalid-token"}
    elif auth_mode == "expired":
        token = jwt.encode(
            {"sub": str(test_user.id), "exp": 1},
            get_settings().secret_key,
            algorithm="HS256",
        )
        headers = {"Authorization": f"Bearer {token}"}
    with (
        patch.object(extraction_api, "capabilities") as caps,
        patch.object(extraction_api, "extract_clothing") as extraction,
    ):
        response = await _request(client, method, headers)
    assert response.status_code == 401, response.text
    assert response.headers["www-authenticate"] == "Bearer"
    caps.assert_not_called()
    extraction.assert_not_called()


@pytest.mark.parametrize("method", ["GET", "POST"])
async def test_inactive_account_cannot_extract(client, db_session, test_user, auth_headers, method):
    test_user.is_active = False
    await db_session.commit()
    with (
        patch.object(extraction_api, "capabilities") as caps,
        patch.object(extraction_api, "extract_clothing") as extraction,
    ):
        response = await _request(client, method, auth_headers)
    assert response.status_code == 403, response.text
    caps.assert_not_called()
    extraction.assert_not_called()


async def test_capabilities_missing_model_is_safe_and_authenticated(
    client, auth_headers, monkeypatch, tmp_path
):
    monkeypatch.setenv("CLOTHING_EXTRACTION_MODEL_PATH", str(tmp_path / "absent-model.onnx"))
    response = await client.get(URL + "/capabilities", headers=auth_headers)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "available": False,
        "model": service.MODEL,
        "max_bytes": service.MAX_BYTES,
        "max_pixels": service.MAX_PIXELS,
    }
    assert str(tmp_path) not in response.text


async def test_valid_image_with_missing_model_returns_503(
    client, auth_headers, monkeypatch, tmp_path
):
    monkeypatch.setenv("CLOTHING_EXTRACTION_MODEL_PATH", str(tmp_path / "absent-model.onnx"))
    response = await client.post(URL, files=_files(), headers=auth_headers)
    assert response.status_code == 503, response.text
    assert "not installed or verified" in response.json()["detail"]
    assert str(tmp_path) not in response.text


@pytest.mark.parametrize("content", [b"", b"not an image", _png((4097, 1))])
async def test_invalid_images_are_rejected_before_model_access(client, auth_headers, content):
    with patch.object(service, "capabilities") as caps:
        response = await client.post(URL, files=_files(content), headers=auth_headers)
    assert response.status_code == 400, response.text
    caps.assert_not_called()


async def test_oversize_upload_returns_413_without_starting_inference(client, auth_headers):
    with patch.object(extraction_api, "extract_clothing") as extraction:
        response = await client.post(
            URL, files=_files(b"x" * (service.MAX_BYTES + 1)), headers=auth_headers
        )
    assert response.status_code == 413, response.text
    assert "12 MB" in response.json()["detail"]
    extraction.assert_not_called()


async def test_missing_upload_is_rejected(client, auth_headers):
    with patch.object(extraction_api, "extract_clothing") as extraction:
        response = await client.post(URL, headers=auth_headers)
    assert response.status_code == 422, response.text
    extraction.assert_not_called()


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (service.ExtractionInputError("Invalid pixels"), 400),
        (service.ExtractionBusy("Try again shortly"), 429),
        (service.ExtractionUnavailable("Model is unavailable"), 503),
        (service.ExtractionTimeout("Inference timed out"), 504),
    ],
)
async def test_service_errors_map_to_http_status(client, auth_headers, error, code):
    with patch.object(extraction_api, "extract_clothing", side_effect=error):
        response = await client.post(URL, files=_files(), headers=auth_headers)
    assert response.status_code == code, response.text
    assert response.json()["detail"] == str(error)
    if code == 429:
        assert response.headers["retry-after"] == "5"


def _known_segmentation(content):
    """Only model inference is replaced; decode and real alpha encoding run."""
    image = service.decode_image(content)
    width, height = image.size
    logits = np.full((18, height, width), -8, dtype=np.float32)
    logits[0] = 8
    for label, box in [(4, (20, 10, 44, 28)), (9, (20, 52, 27, 58)), (10, (37, 52, 44, 58))]:
        x0, y0, x1, y1 = box
        logits[0, y0:y1, x0:x1] = -8
        logits[label, y0:y1, x0:x1] = 8
    return {
        "model": service.MODEL,
        "image_width": width,
        "image_height": height,
        "pieces": service.pieces_from_logits(image, logits, (0, 0, width, height)),
        "warnings": ["Review visible regions before saving."],
    }


async def test_authenticated_preview_returns_real_alpha_png_without_creating_items(
    client, db_session, test_user, auth_headers
):
    query = (
        select(func.count()).select_from(ClothingItem).where(ClothingItem.user_id == test_user.id)
    )
    before = await db_session.scalar(query)
    with patch.object(
        extraction_api, "extract_clothing", side_effect=_known_segmentation
    ) as inference:
        response = await client.post(URL, files=_files(), headers=auth_headers)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    assert payload["model"] == service.MODEL
    assert (payload["image_width"], payload["image_height"]) == (64, 64)
    assert [piece["type"] for piece in payload["pieces"]] == ["top", "shoes"]
    assert [piece["category"] for piece in payload["pieces"]] == ["top", "shoes"]
    assert payload["warnings"]
    inference.assert_called_once_with(_png())
    for piece in payload["pieces"]:
        assert piece["id"] == piece["type"]
        assert 0 <= piece["confidence"] <= 1
        assert all(0 <= value <= 1 for value in piece["bbox"].values())
        prefix, content = piece["thumbnail_data_url"].split(",", 1)
        assert prefix == "data:image/png;base64"
        encoded = base64.b64decode(content, validate=True)
        assert encoded.startswith(b"\x89PNG\r\n\x1a\n")
        png = Image.open(io.BytesIO(encoded))
        png.load()
        assert png.format == "PNG"
        assert png.mode == "RGBA"
        assert not png.getexif()
        if piece["type"] == "shoes":
            assert png.size == (24, 6)
            assert png.getpixel((2, 2))[3] == 255
            assert png.getpixel((11, 2)) == (0, 0, 0, 0)
    assert await db_session.scalar(query) == before
