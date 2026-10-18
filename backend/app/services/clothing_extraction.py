"""Local SCHP garment masks. No network calls, uploads, storage, or item creation.

The publisher's RGB processor differs from the original SCHP extractor: the
checkpoint was trained on OpenCV BGR and aspect-preserving affine inputs.
Weights are provisioned separately; never download them during a request.
"""

from __future__ import annotations

import base64
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import threading
import warnings
from collections import deque
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

MODEL = "schp-atr18-int8"
MODEL_SHA256 = "4420d8db8c1f266967c89485786b01209f6d405f320fc0f87e8ced49392cefb5"
MAX_BYTES = 12 * 1024 * 1024
MAX_PIXELS = 16_000_000
MAX_SIDE = 4096
TIMEOUT_SECONDS = 45
_GATE = threading.Lock()
_HASH_CACHE: tuple[str, int, int, bool] | None = None


class ExtractionInputError(ValueError):
    pass


class ExtractionUnavailable(RuntimeError):
    pass


class ExtractionBusy(RuntimeError):
    pass


class ExtractionTimeout(RuntimeError):
    pass


def model_path() -> Path:
    return Path(
        os.environ.get(
            "CLOTHING_EXTRACTION_MODEL_PATH", "/data/models/schp-atr-18-int8-static.onnx"
        )
    )


def capabilities() -> dict:
    """Readiness checks dependencies and the pinned graph, without exposing paths."""
    global _HASH_CACHE
    ready = False
    path = model_path()
    if importlib.util.find_spec("onnxruntime") and importlib.util.find_spec("numpy"):
        try:
            stat = path.stat()
            identity = (str(path), stat.st_size, stat.st_mtime_ns)
            if _HASH_CACHE is None or _HASH_CACHE[:3] != identity:
                with path.open("rb") as model_file:
                    digest = hashlib.file_digest(model_file, "sha256").hexdigest()
                _HASH_CACHE = (*identity, digest == MODEL_SHA256)
            ready = _HASH_CACHE[3]
        except OSError:
            pass
    return {"available": ready, "model": MODEL, "max_bytes": MAX_BYTES, "max_pixels": MAX_PIXELS}


def decode_image(content: bytes) -> Image.Image:
    if not content or len(content) > MAX_BYTES:
        raise ExtractionInputError("Image must be non-empty and at most 12 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as source:
                if source.width * source.height > MAX_PIXELS or max(source.size) > MAX_SIDE:
                    raise ExtractionInputError(
                        "Image exceeds 4096 pixels per side or 16 megapixels"
                    )
                if getattr(source, "n_frames", 1) != 1:
                    raise ExtractionInputError("Use a single still image")
                source.load()
                image = ImageOps.exif_transpose(source).convert("RGBA")
                # Transparent inputs must not expose hidden RGB content to inference.
                background = Image.new("RGBA", image.size, "white")
                background.alpha_composite(image)
                clean = Image.new("RGB", image.size)
                clean.paste(background.convert("RGB"))
                return clean
    except ExtractionInputError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise ExtractionInputError("Image could not be decoded safely") from exc


def prepare_input(image: Image.Image):
    import numpy as np

    scale = 512 / max(image.size)
    size = tuple(max(1, round(n * scale)) for n in image.size)
    x, y = (512 - size[0]) // 2, (512 - size[1]) // 2
    canvas = Image.new("RGB", (512, 512))
    canvas.paste(image.resize(size, Image.Resampling.BILINEAR), (x, y))
    pixels = np.asarray(canvas, dtype=np.float32)[:, :, ::-1] / 255.0
    pixels = (pixels - np.array([0.406, 0.456, 0.485], np.float32)) / np.array(
        [0.225, 0.224, 0.229], np.float32
    )
    return np.ascontiguousarray(pixels.transpose(2, 0, 1)[None]), (x, y, x + size[0], y + size[1])


def _remove_specks(mask):
    """Keep substantial connected regions; a pair of shoes stays two regions."""
    import numpy as np

    remaining = mask.copy()
    height, width = mask.shape
    components = []
    for y, x in zip(*np.nonzero(mask), strict=True):
        if not remaining[y, x]:
            continue
        pending = deque([(int(y), int(x))])
        remaining[y, x] = False
        component = []
        while pending:
            cy, cx = pending.popleft()
            component.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < height and 0 <= nx < width and remaining[ny, nx]:
                    remaining[ny, nx] = False
                    pending.append((ny, nx))
        components.append(component)
    if not components:
        return mask
    minimum = max(8, max(map(len, components)) * 0.03)
    result = np.zeros_like(mask)
    for component in components:
        if len(component) >= minimum:
            ys, xs = zip(*component, strict=True)
            result[ys, xs] = True
    return result


def pieces_from_logits(image: Image.Image, logits, input_box: tuple) -> list[dict]:
    import numpy as np

    if logits.ndim != 3 or logits.shape[0] != 18 or not np.isfinite(logits).all():
        raise ExtractionUnavailable("Unexpected segmentation model output")
    label_map = logits.argmax(axis=0)
    exp = np.exp(logits - logits.max(axis=0, keepdims=True))
    probability = exp / exp.sum(axis=0, keepdims=True)
    groups = [
        ("top", "top", [4]),
        ("skirt", "bottom", [5]),
        ("pants", "bottom", [6]),
        ("dress", "dress", [7]),
        ("shoes", "shoes", [9, 10]),
    ]
    pieces = []
    w, h = image.size
    for item_type, category, labels in groups:
        region_probability = probability[labels].sum(axis=0)
        selected = _remove_specks(np.isin(label_map, labels) & (region_probability >= 0.7))
        count = int(selected.sum())
        # Footwear is naturally small. Never turn stray pixels into wardrobe items.
        min_area = 0.0007 if category == "shoes" else 0.004
        if count < max(16, label_map.size * min_area):
            continue
        confidence = float(region_probability[selected].mean())
        if confidence < 0.6:
            continue
        mask = Image.fromarray(selected.astype("uint8") * 255).crop(input_box)
        mask = mask.resize(image.size, Image.Resampling.BILINEAR)
        bbox = mask.getbbox()
        if not bbox:
            continue
        rgba = np.asarray(image.convert("RGBA")).copy()
        rgba[:, :, 3] = np.asarray(mask)
        rgba[rgba[:, :, 3] == 0] = 0
        cutout = Image.fromarray(rgba).crop(bbox)
        cutout.thumbnail((768, 768), Image.Resampling.LANCZOS)
        png = io.BytesIO()
        cutout.save(png, "PNG")
        x0, y0, x1, y1 = bbox
        pieces.append(
            {
                "id": item_type,
                "type": item_type,
                "category": category,
                "bbox": {"x": x0 / w, "y": y0 / h, "width": (x1 - x0) / w, "height": (y1 - y0) / h},
                "thumbnail_data_url": "data:image/png;base64,"
                + base64.b64encode(png.getvalue()).decode("ascii"),
                "confidence": round(confidence, 4),
                "_area": count,
            }
        )
    # A mixed dress/separates result is a model ambiguity; return visible regions
    # for explicit review, never infer an occluded garment or fabricate pixels.
    pieces = sorted(
        sorted(pieces, key=lambda p: p["_area"], reverse=True)[:4],
        key=lambda p: ["top", "skirt", "pants", "dress", "shoes"].index(p["type"]),
    )
    for piece in pieces:
        piece.pop("_area")
    return pieces


def _infer(content: bytes, path: str) -> dict:
    import onnxruntime as ort

    image = decode_image(content)
    width, height = image.size
    image.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
    tensor, box = prepare_input(image)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    session = ort.InferenceSession(path, options, providers=["CPUExecutionProvider"])
    logits = session.run(["logits"], {"pixel_values": tensor})[0][0]
    pieces = pieces_from_logits(image, logits, box)
    return {
        "model": MODEL,
        "image_width": width,
        "image_height": height,
        "pieces": pieces,
        "warnings": ["请核对分类与边缘；仅提取照片中可见区域，被遮挡的衣物部分无法还原。"],
    }


def extract_clothing(content: bytes) -> dict:
    """One bounded worker per API process; timeout kills the actual computation."""
    # Validate before spawning; the child repeats decoding and strips metadata.
    decode_image(content)
    if not capabilities()["available"]:
        raise ExtractionUnavailable("Local clothing extraction model is not installed or verified")
    if not _GATE.acquire(blocking=False):
        raise ExtractionBusy("Clothing extraction is busy; try again shortly")
    try:
        with subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), str(model_path())],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env={**os.environ, "OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "1"},
        ) as worker:
            try:
                output, _ = worker.communicate(content, timeout=TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired as exc:
                worker.kill()
                worker.communicate()
                raise ExtractionTimeout("Local clothing extraction timed out") from exc
            if worker.returncode:
                raise ExtractionUnavailable("Local clothing extraction failed")
            return json.loads(output)
    finally:
        _GATE.release()


if __name__ == "__main__":
    # Only server-controlled model path and bounded image bytes cross this pipe.
    payload = sys.stdin.buffer.read(MAX_BYTES + 1)
    print(json.dumps(_infer(payload, sys.argv[1]), ensure_ascii=False))
