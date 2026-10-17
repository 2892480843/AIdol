#!/usr/bin/env python3
"""
Regenerate thumbnails for all existing items.

Usage:
    docker compose exec backend python scripts/regenerate_thumbnails.py

Or in production:
    docker compose -f docker-compose.prod.yml exec backend python scripts/regenerate_thumbnails.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.models.item import ClothingItem
from app.services.image_service import VARIANTS, ImageService


def regenerate_variants(service: ImageService, original_path: Path) -> None:
    key = original_path.relative_to(service.storage_path).as_posix()
    regenerate_stored_variants(service, key)


def regenerate_stored_variants(service: ImageService, key: str) -> None:
    base = key.rsplit(".", 1)[0]
    with service.materialize_image(key) as local_path, Image.open(local_path) as image:
        image.load()
        for variant in VARIANTS[1:]:
            service.storage.write(
                f"{base}{variant.suffix}.jpg", service.encode_variant(image, variant), "image/jpeg"
            )


async def regenerate_all():
    """Regenerate thumbnails for all items."""
    settings = get_settings()
    service = ImageService()

    # Create async engine
    engine = create_async_engine(str(settings.database_url))
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # Get all items with images
        result = await db.execute(select(ClothingItem).where(ClothingItem.image_path.isnot(None)))
        items = result.scalars().all()

        print(f"Found {len(items)} items to process")

        success = 0
        skipped = 0
        failed = 0

        for item in items:
            try:
                # Get original image path
                if not await asyncio.to_thread(service.storage.exists, item.image_path):
                    print(f"  [{item.id}] Original not found: {item.image_path}")
                    skipped += 1
                    continue

                await asyncio.to_thread(regenerate_stored_variants, service, item.image_path)

                print(f"  [{item.id}] Regenerated: {item.name or 'unnamed'}")
                success += 1

            except Exception as e:
                print(f"  [{item.id}] Error: {e}")
                failed += 1

        print(f"\nDone! Success: {success}, Skipped: {skipped}, Failed: {failed}")

    await engine.dispose()


if __name__ == "__main__":
    print("Regenerating thumbnails with new sizes...")
    for variant in VARIANTS[1:]:
        print(f"  {variant.path_field}: {variant.box} @ q{variant.quality}")
    print()

    asyncio.run(regenerate_all())
