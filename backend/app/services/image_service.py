import asyncio
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path

import imagehash
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from app.config import get_settings
from app.services import background_removal
from app.storage import FileSystemStorage, ObjectStorage, create_storage, validate_key

settings = get_settings()


@dataclass(frozen=True)
class ImageVariant:
    path_field: str
    suffix: str
    max_px: int
    quality: int

    @property
    def box(self) -> tuple[int, int]:
        return (self.max_px, self.max_px)


# Thumbnails are 400px so that ~200px cards stay sharp on retina screens.
VARIANTS = (
    ImageVariant("image_path", "", 2400, 95),
    ImageVariant("medium_path", "_medium", 800, 90),
    ImageVariant("thumbnail_path", "_thumb", 400, 88),
)
ORIGINAL = VARIANTS[0]

IMAGE_MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
}
ALLOWED_EXTENSIONS = frozenset(IMAGE_MIME_TYPES)
ALLOWED_MIME_TYPES = frozenset(IMAGE_MIME_TYPES.values())


def _flatten_to_rgb(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "P", "LA"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        if image.mode == "P":
            image = image.convert("RGBA")
        background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
        return background
    if image.mode != "RGB":
        return image.convert("RGB")
    return image


class ImageTooLargeError(ValueError):
    def __init__(self, pixels: int, limit_pixels: int):
        self.pixels = pixels
        self.limit_pixels = limit_pixels
        super().__init__(
            f"Image is {pixels / 1_000_000:.1f}MP, above the {limit_pixels / 1_000_000:.1f}MP limit"
        )


class ImageService:
    def __init__(self, storage_path: str | None = None, *, storage: ObjectStorage | None = None):
        self.storage_path = Path(storage_path or settings.storage_path)
        self.storage = storage or (
            FileSystemStorage(storage_path)
            if storage_path is not None
            else create_storage(settings)
        )

    def _generate_filename(self, extension: str = ".jpg") -> str:
        """Generate a unique filename."""
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        return f"{timestamp}_{unique_id}{extension}"

    def _convert_heic(self, image_data: bytes) -> Image.Image:
        """Convert HEIC/HEIF to PIL Image."""
        register_heif_opener()
        return Image.open(BytesIO(image_data))

    def _open_bounded(self, image_data: bytes, ext: str) -> Image.Image:
        """Open an upload without ever allocating a full-resolution buffer for it.

        Image.open parses only the header, and draft() picks a JPEG DCT scaling
        factor, so both run before any pixel decode. draft never scales below the
        requested box, so the variants generated afterwards are unaffected. It is
        a no-op for formats that cannot scale during decode, which is why the
        ceiling is checked on the post-draft size.
        """
        if ext in (".heic", ".heif"):
            image = self._convert_heic(image_data)
        else:
            image = Image.open(BytesIO(image_data))

        image.draft("RGB", ORIGINAL.box)

        pixels = image.size[0] * image.size[1]
        limit_pixels = int(settings.max_image_megapixels * 1_000_000)
        if pixels > limit_pixels:
            raise ImageTooLargeError(pixels, limit_pixels)

        return image

    def encode_variant(self, image: Image.Image, variant: ImageVariant) -> bytes:
        image = _flatten_to_rgb(image.copy())
        image.thumbnail(variant.box, Image.Resampling.LANCZOS)
        output = BytesIO()
        image.save(output, format="JPEG", quality=variant.quality, optimize=True)
        return output.getvalue()

    async def process_and_store(
        self,
        user_id: uuid.UUID,
        image_data: bytes,
        original_filename: str,
    ) -> dict[str, str]:
        """
        Process an uploaded image and store all sizes.

        Returns the relative path of each variant plus the pHash:
        {
            "image_path": "user_id/20240116_123456_abc123.jpg",
            "medium_path": "user_id/20240116_123456_abc123_medium.jpg",
            "thumbnail_path": "user_id/20240116_123456_abc123_thumb.jpg",
            "image_hash": "c3d4...",
        }
        """
        return await asyncio.to_thread(
            self._process_and_store, user_id, image_data, original_filename
        )

    def _process_and_store(
        self, user_id: uuid.UUID, image_data: bytes, original_filename: str
    ) -> dict[str, str]:
        # Validate file extension
        ext = Path(original_filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"Unsupported file type: {ext}")

        image = self._open_bounded(image_data, ext)

        # iPhones (and some Android cameras) store a raw sensor image plus an EXIF
        # orientation tag instead of rotating pixels, so portrait photos must be
        # transposed here or they end up sideways in storage and in AI tagging.
        image = ImageOps.exif_transpose(image)

        base_name = self._generate_filename(".jpg").rsplit(".", 1)[0]
        paths = {}

        for variant in VARIANTS:
            filename = f"{base_name}{variant.suffix}.jpg"
            key = f"{user_id}/{filename}"
            self.storage.write(key, self.encode_variant(image, variant), "image/jpeg")
            paths[variant.path_field] = key

        paths["image_hash"] = self._phash_of(image)
        return paths

    def get_image_path(self, relative_path: str) -> Path:
        """Get a filesystem path. Object storage callers must use materialize_image."""
        path = self.storage.local_path(relative_path)
        if path is None:
            raise ValueError("Object storage images require a scoped local materialization")
        return path

    def get_job_image_path(self, relative_path: str) -> str:
        """Preserve legacy filesystem jobs while never queueing temporary downloads."""
        key = validate_key(relative_path)
        local = self.storage.local_path(key)
        return str(local) if local is not None else f"storage://{key}"

    def _reference_key(self, reference: str | Path) -> str:
        reference = str(reference)
        if reference.startswith("storage://"):
            return validate_key(reference[len("storage://") :])
        path = Path(reference)
        if path.is_absolute():
            # Absolute paths queued before migration remain valid object keys,
            # but cannot expose arbitrary files outside the configured root.
            try:
                reference = path.resolve().relative_to(self.storage_path.resolve()).as_posix()
            except ValueError:
                raise ValueError("Image reference escapes storage root") from None
        return validate_key(reference)

    def read_image(self, relative_path: str) -> bytes:
        return self.storage.read(relative_path)

    def _download_image(self, key: str, target: Path) -> None:
        with self.storage.open(key) as obj, target.open("wb") as output:
            shutil.copyfileobj(obj.body, output, length=64 * 1024)

    @contextmanager
    def materialize_image(self, reference: str | Path):
        key = self._reference_key(reference)
        local = self.storage.local_path(key)
        if local is not None:
            if not local.is_file():
                raise FileNotFoundError(key)
            yield local
            return
        with tempfile.TemporaryDirectory(prefix="wardrobe-image-") as directory:
            target = Path(directory) / Path(key).name
            self._download_image(key, target)
            yield target

    @asynccontextmanager
    async def materialize_image_async(self, reference: str | Path):
        key = self._reference_key(reference)
        local = self.storage.local_path(key)
        if local is not None:
            if not local.is_file():
                raise FileNotFoundError(key)
            yield local
            return
        with tempfile.TemporaryDirectory(prefix="wardrobe-image-") as directory:
            target = Path(directory) / Path(key).name
            await asyncio.to_thread(self._download_image, key, target)
            yield target

    def delete_images(self, paths: dict[str, str | None]) -> None:
        """Delete all image files for an item."""
        for path in paths.values():
            if path:
                self.storage.delete(path)

    def validate_image(self, image_data: bytes, content_type: str) -> bool:
        """Validate image data and content type."""
        # Check content type
        if content_type not in ALLOWED_MIME_TYPES:
            return False

        # Check file size (max 20MB)
        if len(image_data) > 20 * 1024 * 1024:
            return False

        # Try to open as image
        try:
            if content_type in ("image/heic", "image/heif"):
                self._convert_heic(image_data)
            else:
                Image.open(BytesIO(image_data))
            return True
        except Exception:
            return False

    def compute_phash(self, image_data: bytes, original_filename: str) -> str:
        """
        Compute perceptual hash (pHash) for an image.

        Returns a 16-character hex string representing the 64-bit hash.
        """
        image = self._open_bounded(image_data, Path(original_filename).suffix.lower())
        return self._phash_of(ImageOps.exif_transpose(image))

    def _phash_of(self, image: Image.Image) -> str:
        if image.mode != "RGB":
            image = image.convert("RGB")
        return str(imagehash.phash(image))

    def compute_phash_from_path(self, image_path: Path) -> str:
        """Compute pHash from a file path."""
        image = Image.open(image_path)
        if image.mode != "RGB":
            image = image.convert("RGB")
        phash = imagehash.phash(image)
        return str(phash)

    @staticmethod
    def hash_distance(hash1: str, hash2: str) -> int:
        """
        Compute Hamming distance between two hashes.

        Lower distance = more similar images.
        Distance 0 = identical/near-identical images.
        Distance < 10 = very similar images.
        """
        h1 = imagehash.hex_to_hash(hash1)
        h2 = imagehash.hex_to_hash(hash2)
        return h1 - h2

    @staticmethod
    def is_duplicate(hash1: str, hash2: str, threshold: int = 8) -> bool:
        """
        Check if two images are duplicates based on hash distance.

        Default threshold of 8 catches near-identical images while allowing
        for minor differences in lighting/compression.
        """
        return ImageService.hash_distance(hash1, hash2) <= threshold

    def _save_all_sizes(self, image: Image.Image, image_path: str) -> dict[str, str]:
        base_path = image_path.rsplit(".", 1)[0]
        paths = {}
        for variant in VARIANTS:
            # The original is written back to image_path itself so that the stored path stays valid.
            path = image_path if variant is ORIGINAL else f"{base_path}{variant.suffix}.jpg"
            self.storage.write(path, self.encode_variant(image, variant), "image/jpeg")
            paths[variant.path_field] = path
        return paths

    def remove_background(
        self,
        image_path: str,
        bg_color: tuple[int, int, int] = (255, 255, 255),
    ) -> dict[str, str]:
        base_path = image_path.rsplit(".", 1)[0]
        try:
            original_bytes = self.storage.read(image_path)
        except FileNotFoundError:
            raise ValueError(f"Image not found: {image_path}") from None

        backup_path = f"{base_path}_orig.jpg"
        # First removal wins: a second removal must not overwrite the true
        # original with an already-processed image
        self.storage.write(backup_path, original_bytes, "image/jpeg", if_absent=True)

        image = Image.open(BytesIO(original_bytes)).convert("RGB")
        provider = background_removal.get_provider()
        result = provider.remove(image)

        # Composite onto solid color background
        background = Image.new("RGBA", result.size, (*bg_color, 255))
        background.paste(result, mask=result.split()[3])
        final = background.convert("RGB")

        paths = self._save_all_sizes(final, image_path)
        paths["original_backup_path"] = backup_path
        return paths

    def restore_original(self, image_path: str, backup_path: str) -> dict[str, str]:
        try:
            backup_bytes = self.storage.read(backup_path)
        except FileNotFoundError:
            raise ValueError(f"Backup not found: {backup_path}") from None

        image = Image.open(BytesIO(backup_bytes)).convert("RGB")
        paths = self._save_all_sizes(image, image_path)
        self.storage.delete(backup_path)
        return paths

    def rotate_image(self, image_path: str, direction: str = "cw") -> dict[str, str]:
        """
        Rotate an image and regenerate all sizes.

        Args:
            image_path: Relative path to the original image (e.g., "user_id/filename.jpg")
            direction: "cw" for clockwise 90°, "ccw" for counter-clockwise 90°

        Returns:
            dict with updated paths (same as input since we overwrite)
        """
        try:
            original_bytes = self.storage.read(image_path)
        except FileNotFoundError:
            raise ValueError(f"Image not found: {image_path}") from None

        angle = -90 if direction == "cw" else 90  # PIL rotates counter-clockwise by default

        image = _flatten_to_rgb(Image.open(BytesIO(original_bytes)))

        rotated = image.rotate(angle, expand=True)

        return self._save_all_sizes(rotated, image_path)
