#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
if [ -d /Applications/Docker.app/Contents/Resources/bin ]; then
  PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
  export PATH
fi
docker run --rm --network none \
  -e PYTHONDONTWRITEBYTECODE=1 \
  -e TEST_DATABASE_URL=postgresql+asyncpg://unit:unit@127.0.0.1:1/unit_only \
  -e DATABASE_URL=postgresql+asyncpg://unit:unit@127.0.0.1:1/unit_only \
  -e REDIS_URL=redis://127.0.0.1:1/15 \
  -e AI_API_KEY=offline-test-only \
  -e AI_BASE_URL=https://provider.invalid/v1 \
  --mount "type=bind,source=$PWD/backend,target=/app,readonly" \
  --mount "type=bind,source=$PWD/verification/direct-tryon,target=/evidence" \
  --entrypoint python wardrowbe-backend:tryon-20261017-r2 \
  -m pytest -p no:cacheprovider tests/test_tryon_multi.py tests/test_tryon.py \
  -k 'multi or default_model_matches or seedream_transport or invalid_or_url_provider or one_complete_sse or business_failure or observed_business' \
  --junitxml=/evidence/backend-offline-final.xml
