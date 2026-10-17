#!/bin/sh
# Briefly pause writers for a consistent database + object backup on this Mac.
set -eu
umask 077
cd "$(dirname "$0")/.."
mkdir -p "$PWD/backups"
backup_dir="$(mktemp -d "$PWD/backups/$(date +%Y%m%d-%H%M%S)-XXXXXX")"
resume_writers() {
  ./local.sh up -d --no-deps backend worker image-worker task-worker task-dispatcher >/dev/null
}
trap resume_writers EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
./local.sh stop backend worker image-worker task-worker task-dispatcher
./local.sh exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_dir/database.dump"
./local.sh run --rm --no-deps -T -v "$backup_dir:/backup" backend python scripts/backup_storage.py --output /backup/images
printf 'Backup saved: %s\n' "$backup_dir"
