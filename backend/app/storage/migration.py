"""Copy-only migration: stable keys, byte verification, no DB or source mutations."""

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.storage import FileSystemStorage, ObjectStorage, content_type_for_key, validate_key


class MigrationConflict(RuntimeError):
    pass


@dataclass
class MigrationResult:
    planned: int = 0
    copied: int = 0
    verified: int = 0
    bytes: int = 0


def _digest_object(destination: ObjectStorage, key: str) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with destination.open(key) as obj:
        while chunk := obj.body.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def _record(manifest: Path | None, key: str, digest: str, size: int) -> None:
    if manifest is None:
        return
    manifest.parent.mkdir(parents=True, exist_ok=True)
    event = {
        "key": key,
        "sha256": digest,
        "size": size,
        "status": "verified",
        "verified_at": datetime.now(UTC).isoformat(),
    }
    with manifest.open("a", encoding="utf-8") as output:
        output.write(json.dumps(event, ensure_ascii=False) + "\n")
        output.flush()
        os.fsync(output.fileno())


def migrate_local(
    source: str | Path,
    destination: ObjectStorage,
    *,
    dry_run: bool = True,
    verify_only: bool = False,
    manifest: Path | None = None,
    backup_dir: Path | None = None,
) -> MigrationResult:
    """Resumability is based on remote bytes, never a possibly stale manifest.

    Source files (including _orig backups) are always retained. Existing remote
    keys are compared rather than overwritten, and conditional PUT also guards
    another process creating a key between the existence check and the upload.
    """
    source = Path(source).resolve()
    if not source.is_dir():
        raise ValueError("Migration source must be an existing directory")
    if manifest is not None and manifest.resolve().is_relative_to(source):
        raise ValueError("Migration manifest must be outside the source directory")
    if backup_dir is not None and backup_dir.resolve().is_relative_to(source):
        raise ValueError("Backup directory must be outside the source directory")

    # Validate the complete inventory before writing even the first object.
    files = []
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise ValueError("Migration source contains a symlink")
        if path.is_file():
            files.append((path, validate_key(path.relative_to(source).as_posix())))

    backup_storage = None
    if backup_dir is not None and not dry_run and not verify_only:
        backup_storage = FileSystemStorage(backup_dir)
    result = MigrationResult()
    for path, key in files:
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        size = len(data)
        result.planned += 1
        result.bytes += size

        exists = destination.exists(key)
        if exists:
            if _digest_object(destination, key) != (digest, size):
                raise MigrationConflict(f"Destination content differs: {key}")
        elif verify_only:
            raise MigrationConflict(f"Destination object is missing: {key}")
        elif dry_run:
            continue

        if backup_storage is not None:
            backup_storage.write(key, data, content_type_for_key(key), if_absent=True)
            if _digest_object(backup_storage, key) != (digest, size):
                raise MigrationConflict(f"Backup content differs: {key}")

        if not exists:
            wrote = destination.write(key, data, content_type_for_key(key), if_absent=True)
            if _digest_object(destination, key) != (digest, size):
                raise MigrationConflict(f"Destination verification failed: {key}")
            result.copied += int(wrote)

        # Detect source changes during copy/verification rather than reporting
        # a successful snapshot which never existed. Rerun with writers stopped.
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise MigrationConflict(f"Source changed during migration: {key}")
        result.verified += 1
        if not dry_run and not verify_only:
            _record(manifest, key, digest, size)
    return result
