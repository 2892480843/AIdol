#!/bin/sh
set -eu
# Docker Desktop keeps its credential helper here on macOS.
if [ -d /Applications/Docker.app/Contents/Resources/bin ]; then
  PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
  export PATH
fi
cd "$(dirname "$0")"
exec docker compose --env-file .env --env-file .env.ai.local --env-file .env.architecture.local -p wardrowbe -f docker-compose.yml -f docker-compose.local.yml -f docker-compose.architecture.yml "$@"
