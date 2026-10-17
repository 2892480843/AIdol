"""Audit persisted live acceptance results without emitting credentials or AI text."""
import asyncio
import json
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select

from app.config import get_settings
from app.database import async_session_maker
from app.models.item import ClothingItem
from app.models.outfit import Outfit
from app.models.task import DurableTask
from app.storage import create_storage


async def main():
    evidence = json.loads(Path('/evidence/live-tasks.json').read_text())
    user_id = UUID(evidence['test_user_id'])
    async with async_session_maker() as db:
        outfits = (await db.execute(select(Outfit).where(Outfit.user_id == user_id))).scalars().all()
        assert len(outfits) == 4, '3 original + 1 recovered outfit, no cancelled or duplicate output'
        task = await db.get(DurableTask, UUID(evidence['completed_task_id']))
        assert task.request_id.startswith('architecture-live-')
        versions = []
        for outfit in outfits:
            raw = outfit.ai_raw_response
            assert len(raw['_ai_prompt_version']) == 16
            assert raw['_ai_gateway_version'] == 'completion-v1'
            versions.append({key: raw[key] for key in ('_ai_model', '_ai_prompt_version', '_ai_gateway_version')})
        images = (await db.execute(select(ClothingItem).where(ClothingItem.user_id == user_id))).scalars().all()
        store = create_storage()
        assert get_settings().storage_backend == 's3'
        for item in images:
            with store.open(item.image_path) as stored:
                assert stored.size > 0
        result = {'business_outfits': len(outfits), 'no_duplicate_or_cancelled_results': True,
                  'originating_request_id': task.request_id, 'model_versions': versions,
                  'storage_backend': 's3', 'private_images_read': len(images)}
        Path('/evidence/runtime-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
        print(json.dumps(result, ensure_ascii=False))


asyncio.run(main())
