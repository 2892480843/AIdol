"""Private Seedream image-edit adapter; never submits from polling or retries."""

import asyncio
import base64
import binascii
import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import PurePosixPath
from uuid import UUID, uuid4

import httpx
from fastapi import HTTPException
from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.item import ClothingItem, ItemStatus
from app.models.tryon import TryOnTask
from app.observability import model_call, task_context
from app.schemas.tryon import (
    MAX_TRYON_ITEMS,
    TRYON_CATEGORIES,
    TRYON_ITEM_SLOTS,
    TryOnCapabilities,
    TryOnTaskResponse,
)
from app.services.image_service import ImageService, ImageVariant
from app.storage import ObjectStorage, StorageUnavailableError, create_storage

logger = logging.getLogger(__name__)
MAX_PERSON_BYTES = 10 * 1024 * 1024
MAX_RESULT_BYTES = 20 * 1024 * 1024
MAX_PERSON_PIXELS = 20_000_000
MAX_RESPONSE_BYTES = ((MAX_RESULT_BYTES + 2) // 3) * 4 + 64 * 1024
REFERENCE_BOARD_SIDE = 2048
MAX_REFERENCE_BYTES = 10 * 1024 * 1024
MAX_REFERENCE_PIXELS = 20_000_000
MAX_REFERENCE_SIDE = 4096
REFERENCE_PANELS = (
    ("A", "top-left"),
    ("B", "top-right"),
    ("C", "bottom-left"),
    ("D", "bottom-right"),
)
SLOT_PANEL = {"tops": 0, "dresses": 0, "bottoms": 1, "outerwear": 2, "shoes": 3}
TOP_TYPES = frozenset({"shirt", "t-shirt", "top", "polo", "blouse", "tank-top", "sweater"})
PERSON_MIME_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
EDIT_PROMPT = (
    "Edit image 1 using image 2 only as the reference for one upper-body garment. "
    "Replace the upper-body garment worn by the adult in image 1 with the garment in image 2. "
    "Preserve the person's face, identity, body shape, pose, skin tone, other clothing, and background. "
    "Preserve the reference garment's color, pattern, details, and silhouette. "
    "Keep the person fully clothed. Produce one realistic fashion preview image, not a collage."
)


def normalize_item_ids(item_id: UUID | None, item_ids: list | None = None) -> list[UUID]:
    if item_ids is None:
        if item_id is None:
            raise HTTPException(422, detail="invalid_item_ids")
        return [item_id]
    if not isinstance(item_ids, list) or not 1 <= len(item_ids) <= MAX_TRYON_ITEMS:
        raise HTTPException(422, detail="invalid_item_ids")
    try:
        if any(not isinstance(value, (str, UUID)) for value in item_ids):
            raise ValueError
        selected = [value if isinstance(value, UUID) else UUID(value) for value in item_ids]
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(422, detail="invalid_item_ids") from None
    if len(set(selected)) != len(selected) or (item_id is not None and selected[0] != item_id):
        raise HTTPException(422, detail="invalid_item_ids")
    return selected


def validate_slots(slots: list[str]) -> None:
    if not 1 <= len(slots) <= MAX_TRYON_ITEMS or any(
        slot not in TRYON_CATEGORIES for slot in slots
    ):
        raise HTTPException(422, detail="unsupported_garment_category")
    if len(set(slots)) != len(slots) or ("dresses" in slots and ({"tops", "bottoms"} & set(slots))):
        raise HTTPException(422, detail="conflicting_garment_slots")


def edit_prompt(slots: list[str]) -> str:
    validate_slots(slots)
    if slots == ["tops"]:
        return EDIT_PROMPT
    references = " ".join(
        f"Image {index} is the reference only for the {slot} clothing slot."
        for index, slot in enumerate(slots, 2)
    )
    return (
        "Edit image 1, the adult person's photograph. " + references + " "
        "Replace only those corresponding clothing slots using their assigned reference images. "
        "A dress reference replaces the person's original top and bottoms with one base outfit. "
        "Layer outerwear over the referenced top or dress when present. "
        "Preserve the person's face, identity, body shape, pose, skin tone, other clothing, and background. "
        "Preserve every reference garment's color, pattern, details, and silhouette. "
        "Keep the person fully clothed. Produce one realistic fashion preview image, not a collage."
    )


def reference_board_prompt(slots: list[str]) -> str:
    validate_slots(slots)
    occupied = {SLOT_PANEL[slot]: slot for slot in slots}
    legend = " ".join(
        f"Panel {label} ({position}) contains only the {occupied[index]} garment reference."
        if index in occupied
        else f"Panel {label} ({position}) is UNUSED; ignore it."
        for index, (label, position) in enumerate(REFERENCE_PANELS)
    )
    return (
        "Image 1 is the only photograph of the adult person to edit. "
        "Image 2 is a 2-by-2 garment reference board, not the desired output. " + legend + " "
        "Use only the garment in each occupied panel for its named clothing slot on the person. "
        "A dress replaces the original top and bottoms with one base outfit. "
        "Layer outerwear over the referenced top or dress when present. "
        "Ignore panel labels, borders, whitespace, and unused panels; never copy them into the output. "
        "Preserve the person's face, identity, body shape, pose, skin tone, other clothing, and background. "
        "Preserve each referenced garment's color, pattern, details, and silhouette. "
        "Keep the person fully clothed. Return one complete realistic fashion preview of that person "
        "wearing the selected outfit, not a collage or reference board."
    )


def build_reference_board(garments: list[bytes], slots: list[str]) -> bytes:
    """Pack bounded references into fixed category panels without cropping a garment."""
    validate_slots(slots)
    if not 2 <= len(garments) <= MAX_TRYON_ITEMS or len(garments) != len(slots):
        raise HTTPException(422, detail="invalid_garment_references")
    references = {SLOT_PANEL[slot]: garment for garment, slot in zip(garments, slots, strict=True)}
    occupied = {SLOT_PANEL[slot]: slot for slot in slots}
    cell = REFERENCE_BOARD_SIDE // 2
    margin, header = 32, 88
    bounds = (cell - margin * 2, cell - margin * 2 - header)
    board = Image.new("RGB", (REFERENCE_BOARD_SIDE, REFERENCE_BOARD_SIDE), (238, 238, 238))
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default(size=36)
    try:
        for index, (label, _position) in enumerate(REFERENCE_PANELS):
            x, y = (index % 2) * cell, (index // 2) * cell
            draw.rectangle(
                (x + 8, y + 8, x + cell - 9, y + cell - 9),
                fill="white",
                outline=(216, 216, 216),
                width=2,
            )
            draw.text(
                (x + margin, y + margin),
                f"{label}  {occupied.get(index, 'UNUSED').upper()}",
                fill=(20, 20, 20),
                font=font,
            )
            reference = references.get(index)
            if reference is None:
                continue
            if not reference or len(reference) > MAX_REFERENCE_BYTES:
                raise HTTPException(422, detail="invalid_garment_references")
            with Image.open(BytesIO(reference)) as source:
                if (
                    source.format not in ("JPEG", "PNG", "WEBP")
                    or getattr(source, "n_frames", 1) != 1
                    or source.width * source.height > MAX_REFERENCE_PIXELS
                    or max(source.size) > MAX_REFERENCE_SIDE
                ):
                    raise HTTPException(422, detail="invalid_garment_references")
                with ImageOps.exif_transpose(source) as oriented:
                    with ImageOps.contain(oriented, bounds, Image.Resampling.LANCZOS) as fitted:
                        with fitted.convert("RGBA") as rgba:
                            position = (
                                x + (cell - fitted.width) // 2,
                                y + margin + header + (bounds[1] - fitted.height) // 2,
                            )
                            board.paste(rgba, position, rgba)
        output = _jpeg(board, max_side=REFERENCE_BOARD_SIDE)
        if len(output) > MAX_REFERENCE_BYTES:
            raise HTTPException(422, detail="invalid_garment_references")
        return output
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, detail="invalid_garment_references") from None
    finally:
        board.close()


class TryOnProviderError(RuntimeError):
    """A safe error code; never carries the upstream body, URL, or image content."""

    def __init__(self, code="provider_error"):
        self.code = code
        super().__init__(code)


def _image_response_json(body: bytes | bytearray, content_type: str) -> dict:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        if content_type.split(";", 1)[0].strip().lower() != "text/event-stream":
            raise
        # The configured gateway can wrap stream=false in one complete SSE
        # event. Never combine progressive or multiple generated-image events.
        payloads = []
        for event in body.decode("utf-8").replace("\r\n", "\n").split("\n\n"):
            data = "\n".join(
                line[5:].lstrip(" ") for line in event.splitlines() if line.startswith("data:")
            )
            if data and data != "[DONE]":
                payloads.append(json.loads(data))
        if len(payloads) != 1:
            raise ValueError("Expected one complete image response") from None
        payload = payloads[0]
    if not isinstance(payload, dict):
        raise ValueError("Invalid image response")
    code = payload.get("code")
    if payload.get("error") is not None or (
        isinstance(code, (int, float)) and not isinstance(code, bool) and code >= 400
    ):
        raise TryOnProviderError("provider_rejected")
    return payload


def _jpeg(image: Image.Image, max_side=2048) -> bytes:
    image = ImageOps.exif_transpose(image)
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    if image.mode in ("RGBA", "LA", "P"):
        rgba = image.convert("RGBA")
        flattened = Image.new("RGB", rgba.size, "white")
        flattened.paste(rgba, mask=rgba.getchannel("A"))
        image = flattened
    else:
        image = image.convert("RGB")
    output = BytesIO()
    image.save(output, format="JPEG", quality=92)
    return output.getvalue()


def normalize_person(data: bytes, content_type: str) -> bytes:
    if len(data) > MAX_PERSON_BYTES:
        raise HTTPException(413, detail="person_image_too_large")
    if content_type not in PERSON_MIME_TYPES:
        raise HTTPException(415, detail="unsupported_person_image")
    try:
        with Image.open(BytesIO(data)) as image:
            if (
                image.format != PERSON_MIME_TYPES[content_type]
                or getattr(image, "n_frames", 1) != 1
            ):
                raise HTTPException(415, detail="unsupported_person_image")
            if image.width * image.height > MAX_PERSON_PIXELS:
                raise HTTPException(413, detail="person_image_too_large")
            image.load()
            return _jpeg(image)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, detail="invalid_person_image") from None


def task_response(task: TryOnTask) -> TryOnTaskResponse:
    return TryOnTaskResponse(
        id=task.id,
        item_id=task.item_id,
        item_ids=[
            UUID(value) for value in (getattr(task, "item_ids", None) or [str(task.item_id)])
        ],
        status=task.status,
        result_url=(
            f"/api/v1/tryon/tasks/{task.id}/image"
            if task.status == "succeeded" and task.result_path
            else None
        ),
        error_code=task.error_code,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


async def cleanup_item_results(
    db: AsyncSession, item: ClothingItem, storage: ObjectStorage | None = None
) -> None:
    """Delete tracked private results and intents referencing any selected garment.

    The caller holds the source-item lock. A failed object deletion aborts the
    database deletion so its result paths remain available for an explicit retry.
    """
    tasks = (
        (
            await db.execute(
                select(TryOnTask)
                .where(
                    TryOnTask.user_id == item.user_id,
                    or_(TryOnTask.item_id == item.id, TryOnTask.item_ids.contains([str(item.id)])),
                )
                .order_by(TryOnTask.id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    paths = []
    for task in tasks:
        expected = f"tryon/{item.user_id}/{task.id}.jpg"
        if task.result_path and task.result_path != expected:
            raise HTTPException(503, detail="result_cleanup_unavailable")
        # Deletion is idempotent. Include the deterministic key even if a failed
        # database write did not record an already-created private object.
        paths.append(expected)
    if paths:
        storage = storage or create_storage()
        try:
            for path in paths:
                await asyncio.to_thread(storage.delete, path)
        except (OSError, StorageUnavailableError):
            raise HTTPException(503, detail="result_cleanup_unavailable") from None
    # The primary source's FK cascade removes its intents when the caller deletes
    # that garment. Secondary sources need explicit deletion, also while output is
    # in flight; avoid scheduling a duplicate ORM delete for the FK-cascaded rows.
    for task in tasks:
        if task.item_id != item.id:
            await db.delete(task)


class TryOnService:
    def __init__(self, *, settings=None, storage: ObjectStorage | None = None, transport=None):
        self.settings = settings or get_settings()
        self.storage = storage or create_storage(self.settings)
        self.transport = transport

    def capabilities(self) -> TryOnCapabilities:
        configured = bool(self.settings.ai_base_url.strip() and self.settings.ai_api_key)
        enabled = self.settings.tryon_enabled and getattr(
            self.settings, "ai_internal_enabled", True
        )
        return TryOnCapabilities(
            configured=configured,
            enabled=enabled,
            available=configured and enabled,
            reason="disabled" if not enabled else (None if configured else "not_configured"),
            model=self.settings.tryon_model,
        )

    def require_available(self):
        capability = self.capabilities()
        if not capability.available:
            raise HTTPException(503, detail=capability.reason)

    def _garment(self, item: ClothingItem) -> bytes:
        reference = item.original_image_path or item.image_path
        with self.storage.open(reference) as stored:
            if stored.size > 50 * 1024 * 1024:
                raise HTTPException(422, detail="garment_image_unavailable")
            data = stored.body.read(50 * 1024 * 1024 + 1)
        try:
            service = ImageService(storage=self.storage)
            with service._open_bounded(data, PurePosixPath(reference).suffix.lower()) as image:
                return service.encode_variant(image, ImageVariant("image_path", "", 2048, 92))
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
            raise HTTPException(422, detail="garment_image_unavailable") from None

    async def generate(
        self, person: bytes, garment: bytes | list[bytes], *, slots: list[str] | None = None
    ) -> bytes:
        garments = [garment] if isinstance(garment, bytes) else garment
        slots = ["tops"] if slots is None else slots
        validate_slots(slots)
        if len(garments) != len(slots):
            raise HTTPException(422, detail="invalid_garment_references")
        # This is an explicit preprocessing strategy before the sole provider
        # call, never a retry or fallback after an ambiguous upstream failure.
        if len(garments) > 1:
            references = [await asyncio.to_thread(build_reference_board, garments, slots)]
            prompt = reference_board_prompt(slots)
        else:
            references = garments
            prompt = edit_prompt(slots)
        payload = {
            "model": self.settings.tryon_model,
            "prompt": prompt,
            "image": [
                "data:image/jpeg;base64," + base64.b64encode(image).decode("ascii")
                for image in [person, *references]
            ],
            "size": "2K",
            "response_format": "b64_json",
            "sequential_image_generation": "disabled",
            "stream": False,
            "watermark": True,
        }
        with model_call(
            self.settings.tryon_model, "configured-image-provider", "image_edit"
        ) as call:
            async with httpx.AsyncClient(
                timeout=self.settings.tryon_timeout_seconds,
                follow_redirects=False,
                transport=self.transport,
            ) as client:
                async with client.stream(
                    "POST",
                    self.settings.ai_base_url.rstrip("/") + "/images/generations",
                    headers={"Authorization": "Bearer " + (self.settings.ai_api_key or "")},
                    json=payload,
                ) as response:
                    call.http_status = response.status_code
                    if response.status_code != 200:
                        call.finish("error", http_status=response.status_code)
                        raise TryOnProviderError("provider_rejected")
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        body.extend(chunk)
                        if len(body) > MAX_RESPONSE_BYTES:
                            raise TryOnProviderError("invalid_provider_output")
            try:
                result = _image_response_json(body, response.headers.get("content-type", ""))
                images = result.get("data")
                if (
                    not isinstance(images, list)
                    or len(images) != 1
                    or not isinstance(images[0], dict)
                ):
                    raise ValueError
                encoded = images[0].get("b64_json")
                if not isinstance(encoded, str) or len(encoded) > MAX_RESPONSE_BYTES:
                    raise ValueError
                decoded = base64.b64decode(encoded, validate=True)
                if len(decoded) > MAX_RESULT_BYTES:
                    raise ValueError
                with Image.open(BytesIO(decoded)) as image:
                    if (
                        image.format not in ("JPEG", "PNG", "WEBP")
                        or image.width * image.height > MAX_PERSON_PIXELS
                        or getattr(image, "n_frames", 1) != 1
                    ):
                        raise ValueError
                    image.load()
                    output = _jpeg(image)
            except (
                ValueError,
                TypeError,
                AttributeError,
                binascii.Error,
                OSError,
                Image.DecompressionBombError,
            ):
                raise TryOnProviderError("invalid_provider_output") from None
            call.finish(
                "success",
                data={"model": self.settings.tryon_model, "usage": result.get("usage")},
                http_status=200,
            )
            return output

    async def submit(
        self,
        db: AsyncSession,
        owner: UUID,
        item_id: UUID,
        person_data: bytes,
        content_type: str,
        idempotency_key: str,
        *,
        item_ids: list[UUID] | None = None,
    ) -> TryOnTask:
        self.require_available()
        selected = normalize_item_ids(item_id, item_ids)
        # Preserve the historical single-item hash so retries of old intents stay idempotent.
        identity = (
            str(selected[0]).encode()
            if len(selected) == 1
            else b"outfit\0"
            + json.dumps([str(value) for value in selected], separators=(",", ":")).encode()
        )
        request_hash = hashlib.sha256(identity + b"\0" + person_data).hexdigest()
        existing = (
            await db.execute(
                select(TryOnTask).where(
                    TryOnTask.user_id == owner,
                    TryOnTask.idempotency_key == idempotency_key,
                )
            )
        ).scalar_one_or_none()
        if existing:
            if existing.request_hash != request_hash:
                raise HTTPException(409, detail="idempotency_key_conflict")
            return existing
        locked = (
            (
                await db.execute(
                    select(ClothingItem)
                    .where(ClothingItem.id.in_(selected), ClothingItem.user_id == owner)
                    .order_by(ClothingItem.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            )
            .scalars()
            .all()
        )
        by_id = {item.id: item for item in locked}
        if len(by_id) != len(selected):
            raise HTTPException(404, detail="Item not found")
        items = [by_id[value] for value in selected]
        slots = []
        for item in items:
            if item.user_id != owner:
                raise HTTPException(404, detail="Item not found")
            if (
                item.status != ItemStatus.ready
                or item.is_archived
                or item.needs_wash
                or item.type not in TRYON_ITEM_SLOTS
            ):
                raise HTTPException(422, detail="ready_garment_required")
            slots.append(TRYON_ITEM_SLOTS[item.type])
        validate_slots(slots)
        person = await asyncio.to_thread(normalize_person, person_data, content_type)
        try:
            garments = [await asyncio.to_thread(self._garment, item) for item in items]
        except FileNotFoundError:
            raise HTTPException(422, detail="garment_image_unavailable") from None
        except StorageUnavailableError:
            raise HTTPException(503, detail="image_storage_unavailable") from None
        task_id = uuid4()
        statement = (
            insert(TryOnTask)
            .values(
                id=task_id,
                user_id=owner,
                item_id=selected[0],
                item_ids=[str(value) for value in selected],
                idempotency_key=idempotency_key,
                request_hash=request_hash,
                provider="seedream",
                model=self.settings.tryon_model,
                status="processing",
            )
            .on_conflict_do_nothing(constraint="uq_try_on_tasks_owner_key")
            .returning(TryOnTask.id)
        )
        inserted = (await db.execute(statement)).scalar_one_or_none()
        await db.commit()
        task = (
            await db.execute(
                select(TryOnTask).where(
                    TryOnTask.user_id == owner,
                    TryOnTask.idempotency_key == idempotency_key,
                )
            )
        ).scalar_one()
        if inserted is None:
            if task.request_hash != request_hash:
                raise HTTPException(409, detail="idempotency_key_conflict")
            return task
        # Do not hold a database transaction across a remote image edit. An intent
        # is durable before the only paid call, and replay can only return it.
        await db.commit()
        error_code, result_path, output = None, None, None
        try:
            with task_context(str(task_id)):
                async with asyncio.timeout(self.settings.tryon_timeout_seconds):
                    if slots == ["tops"]:
                        output = await self.generate(person, garments[0])
                    else:
                        output = await self.generate(person, garments, slots=slots)
        except (TimeoutError, httpx.TimeoutException, httpx.TransportError):
            error_code = "submission_unknown"
        except TryOnProviderError as error:
            error_code = error.code
        except StorageUnavailableError:
            error_code = "result_storage_unavailable"
        except Exception as error:
            logger.error(
                "Try-on failed",
                extra={"task_id": str(task_id), "error_type": type(error).__name__},
            )
            error_code = "tryon_failed"
        # Re-lock references in the same order as submission before writing a
        # person image. Secondary references do not have an FK cascade, and may
        # have disappeared while the provider was running.
        remaining = (
            (
                await db.execute(
                    select(ClothingItem)
                    .where(ClothingItem.id.in_(selected), ClothingItem.user_id == owner)
                    .order_by(ClothingItem.id)
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
            )
            .scalars()
            .all()
        )
        if len(remaining) != len(selected):
            await db.execute(
                delete(TryOnTask).where(TryOnTask.id == task_id, TryOnTask.user_id == owner)
            )
            await db.commit()
            raise HTTPException(404, detail="Task not found")
        if output is not None and error_code is None:
            result_path = f"tryon/{owner}/{task_id}.jpg"
            try:
                await asyncio.to_thread(self.storage.write, result_path, output, "image/jpeg")
            except (OSError, StorageUnavailableError):
                error_code = "result_storage_unavailable"
                try:
                    await asyncio.to_thread(self.storage.delete, result_path)
                except (OSError, StorageUnavailableError):
                    logger.error("Try-on result cleanup failed", extra={"task_id": str(task_id)})
                else:
                    result_path = None
        updated = (
            await db.execute(
                update(TryOnTask)
                .where(
                    TryOnTask.id == task_id,
                    TryOnTask.user_id == owner,
                    TryOnTask.status == "processing",
                )
                .values(
                    status="failed" if error_code else "succeeded",
                    # Failed tasks never expose a result URL, but retain an
                    # object reference when compensating deletion also failed.
                    result_path=result_path,
                    error_code=error_code,
                    updated_at=datetime.now(UTC),
                )
                .returning(TryOnTask.id)
            )
        ).scalar_one_or_none()
        await db.commit()
        if updated is None:
            # Deleting the source cascades its tasks. Never recreate a deleted
            # intent or leave a just-produced person image behind that deletion.
            if result_path:
                try:
                    await asyncio.to_thread(self.storage.delete, result_path)
                except (OSError, StorageUnavailableError):
                    logger.error("Try-on result cleanup failed", extra={"task_id": str(task_id)})
        return await self.owned(db, owner, task_id)

    async def reconcile(self, db: AsyncSession, owner: UUID) -> None:
        # A killed request may have reached the provider. Mark it unknown; never
        # automatically repeat a potentially charged edit after a restart.
        cutoff = datetime.now(UTC) - timedelta(seconds=self.settings.tryon_timeout_seconds + 60)
        await db.execute(
            update(TryOnTask)
            .where(
                TryOnTask.user_id == owner,
                TryOnTask.status.in_(["submitting", "queued", "processing"]),
                TryOnTask.updated_at < cutoff,
            )
            .values(status="failed", error_code="submission_unknown", updated_at=datetime.now(UTC))
        )
        await db.commit()

    async def owned(self, db: AsyncSession, owner: UUID, task_id: UUID) -> TryOnTask:
        task = (
            await db.execute(
                select(TryOnTask)
                .where(TryOnTask.id == task_id, TryOnTask.user_id == owner)
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if task is None:
            raise HTTPException(404, detail="Task not found")
        return task
