"""Explicit two-image reference-board transport, without any live model request."""

import base64
import json
from io import BytesIO
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from PIL import Image, ImageDraw

from app.services import tryon
from app.storage import FileSystemStorage


def picture(color="blue", mode="RGB", size=(64, 96), fmt="JPEG"):
    output = BytesIO()
    Image.new(mode, size, color).save(output, format=fmt)
    return output.getvalue()


def service(tmp_path):
    calls = []

    def handler(request):
        calls.append(json.loads(request.content))
        return httpx.Response(
            200, json={"data": [{"b64_json": base64.b64encode(picture()).decode()}]}
        )

    settings = SimpleNamespace(
        tryon_model="Doubao-Seedream-5.0-lite",
        tryon_timeout_seconds=90,
        ai_base_url="https://provider.invalid/v1",
        ai_api_key="offline-test-only",
    )
    return tryon.TryOnService(
        settings=settings,
        storage=FileSystemStorage(tmp_path),
        transport=httpx.MockTransport(handler),
    ), calls


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [2, 3, 4])
async def test_multigarment_requests_always_send_person_plus_one_reference_board(tmp_path, count):
    provider, calls = service(tmp_path)
    slots = ["tops", "bottoms", "outerwear", "shoes"][:count]
    person = picture("gray")
    await provider.generate(
        person,
        [picture(color) for color in ["blue", "green", "red", "yellow"][:count]],
        slots=slots,
    )
    assert len(calls) == 1
    payload = calls[0]
    assert len(payload["image"]) == 2
    assert base64.b64decode(payload["image"][0].split(",")[1]) == person
    board = Image.open(BytesIO(base64.b64decode(payload["image"][1].split(",")[1])))
    assert board.size == (2048, 2048)
    assert board.format == "JPEG"
    assert board.mode == "RGB"
    expected = [(0, 0, 255), (0, 128, 0), (255, 0, 0), (255, 255, 0)]
    for index, (x, y) in enumerate([(512, 556), (1536, 556), (512, 1580), (1536, 1580)]):
        color = board.getpixel((x, y))
        target = expected[index] if index < count else (255, 255, 255)
        assert all(
            abs(actual - reference) < 16 for actual, reference in zip(color, target, strict=True)
        )
    prompt = payload["prompt"].lower()
    assert "image 1" in prompt and "image 2" in prompt
    assert "image 3" not in prompt and "image 4" not in prompt and "image 5" not in prompt
    assert "reference board" in prompt and "not a collage" in prompt
    assert "top-left" in prompt and "top-right" in prompt
    assert "bottom-left" in prompt and "bottom-right" in prompt
    for slot in slots:
        assert slot in prompt


def test_board_slot_positions_are_fixed_even_when_the_caller_reverses_references():
    board = Image.open(
        BytesIO(
            tryon.build_reference_board(
                [picture("yellow"), picture("red"), picture("green"), picture("blue")],
                ["shoes", "outerwear", "bottoms", "tops"],
            )
        )
    )
    assert board.getpixel((512, 556))[2] > 230
    assert board.getpixel((1536, 556))[1] > 110
    assert board.getpixel((512, 1580))[0] > 230
    assert board.getpixel((1536, 1580))[0] > 230 and board.getpixel((1536, 1580))[1] > 230


def test_dress_occupies_the_top_left_and_does_not_invent_a_bottom_reference():
    board = Image.open(
        BytesIO(
            tryon.build_reference_board(
                [picture("yellow"), picture("blue"), picture("red")],
                ["shoes", "dresses", "outerwear"],
            )
        )
    )
    assert board.getpixel((512, 556))[2] > 230
    assert min(board.getpixel((1536, 556))) > 240
    assert board.getpixel((512, 1580))[0] > 230
    assert board.getpixel((1536, 1580))[1] > 230


@pytest.mark.asyncio
@pytest.mark.parametrize("slot", ["tops", "dresses", "shoes"])
async def test_single_reference_transport_keeps_the_original_image_and_existing_prompt(
    tmp_path, slot
):
    provider, calls = service(tmp_path)
    garment = picture("red")
    if slot == "tops":
        await provider.generate(picture(), garment)
    else:
        await provider.generate(picture(), [garment], slots=[slot])
    assert len(calls[0]["image"]) == 2
    assert base64.b64decode(calls[0]["image"][1].split(",")[1]) == garment
    assert calls[0]["prompt"] == tryon.edit_prompt([slot])


def test_board_contains_the_entire_reference_without_cropping_or_metadata():
    source = Image.new("RGB", (40, 100), "white")
    draw = ImageDraw.Draw(source)
    draw.rectangle((0, 0, 39, 8), fill="red")
    draw.rectangle((0, 91, 39, 99), fill="blue")
    exif = Image.Exif()
    exif[270] = "private source metadata"
    encoded = BytesIO()
    source.save(encoded, "JPEG", exif=exif)
    result = tryon.build_reference_board(
        [encoded.getvalue(), picture("green")], ["tops", "bottoms"]
    )
    board = Image.open(BytesIO(result))
    assert board.getpixel((512, 126))[0] > 220
    assert board.getpixel((512, 984))[2] > 220
    assert not board.getexif()
    assert b"private source metadata" not in result


def test_transparency_is_composited_on_the_neutral_panel_instead_of_turning_black():
    source = Image.new("RGBA", (64, 96), (0, 0, 0, 0))
    ImageDraw.Draw(source).rectangle((20, 30, 43, 65), fill=(255, 0, 0, 255))
    encoded = BytesIO()
    source.save(encoded, "PNG")
    board = Image.open(
        BytesIO(
            tryon.build_reference_board([encoded.getvalue(), picture("green")], ["tops", "bottoms"])
        )
    )
    assert board.getpixel((512, 556))[0] > 230
    assert min(board.getpixel((400, 160))) > 240


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "problem", ["corrupt", "bytes", "pixels", "side", "animated", "count", "slots"]
)
async def test_invalid_reference_boards_fail_before_any_provider_call(
    tmp_path, monkeypatch, problem
):
    provider, calls = service(tmp_path)
    garments = [picture(), picture("green")]
    slots = ["tops", "bottoms"]
    if problem == "corrupt":
        garments[0] = b"not an image"
    elif problem == "bytes":
        monkeypatch.setattr(tryon, "MAX_REFERENCE_BYTES", 4)
    elif problem == "pixels":
        monkeypatch.setattr(tryon, "MAX_REFERENCE_PIXELS", 4)
    elif problem == "side":
        monkeypatch.setattr(tryon, "MAX_REFERENCE_SIDE", 4)
    elif problem == "animated":
        output = BytesIO()
        first = Image.new("RGB", (8, 8), "red")
        first.save(
            output,
            format="PNG",
            save_all=True,
            append_images=[Image.new("RGB", (8, 8), "blue")],
            duration=100,
        )
        garments[0] = output.getvalue()
    elif problem == "count":
        garments.append(picture("red"))
    elif problem == "slots":
        slots = ["tops", "tops"]
    with pytest.raises(HTTPException) as error:
        await provider.generate(picture(), garments, slots=slots)
    assert error.value.status_code == 422
    assert calls == []
