"""Authenticated, ephemeral outfit-photo segmentation. Review before item creation."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.models.user import User
from app.services.clothing_extraction import (
    MAX_BYTES,
    ExtractionBusy,
    ExtractionInputError,
    ExtractionTimeout,
    ExtractionUnavailable,
    capabilities,
    extract_clothing,
)
from app.utils.auth import get_current_user
from app.utils.uploads import UploadTooLargeError, read_upload_within_limit

router = APIRouter(prefix="/clothing-extraction", tags=["Clothing extraction"])


class ExtractionCapabilities(BaseModel):
    available: bool
    model: str
    max_bytes: int
    max_pixels: int


class NormalizedBox(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)


class ExtractedPiece(BaseModel):
    id: str
    type: Literal["top", "skirt", "pants", "dress", "shoes"]
    category: Literal["top", "bottom", "dress", "shoes"]
    bbox: NormalizedBox
    thumbnail_data_url: str
    confidence: float = Field(ge=0, le=1)


class ExtractionResponse(BaseModel):
    model: str
    image_width: int
    image_height: int
    pieces: list[ExtractedPiece] = Field(max_length=4)
    warnings: list[str]


@router.get("/capabilities", response_model=ExtractionCapabilities)
async def extraction_capabilities(
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    return await run_in_threadpool(capabilities)


@router.post("", response_model=ExtractionResponse)
async def extract_outfit_photo(
    current_user: Annotated[User, Depends(get_current_user)],
    response: Response,
    image: UploadFile = File(...),
) -> dict:
    response.headers["Cache-Control"] = "no-store"
    try:
        content = await read_upload_within_limit(image, MAX_BYTES // (1024 * 1024))
        return await run_in_threadpool(extract_clothing, content)
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from None
    except ExtractionInputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    except ExtractionBusy as exc:
        raise HTTPException(
            status_code=429, detail=str(exc), headers={"Retry-After": "5"}
        ) from None
    except ExtractionTimeout as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from None
    except ExtractionUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    finally:
        await image.close()
