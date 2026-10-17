import hashlib
import json

import pytest

from app.storage import FileSystemStorage
from app.storage.migration import MigrationConflict, migrate_local
from app.storage.s3 import S3Storage
from tests.test_object_storage import FakeS3Client


def seed_source(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "user").mkdir()
    for name, data in {
        "photo.jpg": b"original",
        "photo_thumb.jpg": b"thumb",
        "photo_orig.jpg": b"backup",
    }.items():
        (source / "user" / name).write_bytes(data)
    return source


def test_default_dry_run_does_not_write_remote_manifest_or_backup(tmp_path):
    source = seed_source(tmp_path)
    client = FakeS3Client()
    manifest = tmp_path / "manifest.jsonl"
    backup = tmp_path / "backup"
    result = migrate_local(
        source, S3Storage(bucket="test", client=client), manifest=manifest, backup_dir=backup
    )
    assert result.planned == 3
    assert result.copied == 0
    assert not client.objects
    assert not manifest.exists()
    assert not backup.exists()


def test_copy_is_verified_resumable_and_keeps_originals_and_backups(tmp_path):
    source = seed_source(tmp_path)
    destination = S3Storage(bucket="test", client=FakeS3Client())
    manifest = tmp_path / "manifest.jsonl"
    backup = tmp_path / "backup"
    first = migrate_local(source, destination, dry_run=False, manifest=manifest, backup_dir=backup)
    assert first.copied == first.verified == 3
    assert (backup / "user/photo_orig.jpg").read_bytes() == b"backup"
    assert (source / "user/photo.jpg").read_bytes() == b"original"
    second = migrate_local(source, destination, dry_run=False, manifest=manifest, backup_dir=backup)
    assert second.copied == 0
    assert second.verified == 3
    assert len(destination.client.writes) == 3
    events = [json.loads(line) for line in manifest.read_text().splitlines()]
    assert events[0]["sha256"] == hashlib.sha256(b"original").hexdigest()
    assert events[0]["status"] == "verified"
    assert migrate_local(source, destination, verify_only=True).verified == 3


def test_conflicting_remote_content_is_never_overwritten_even_with_old_manifest(tmp_path):
    source = seed_source(tmp_path)
    destination = S3Storage(bucket="test", client=FakeS3Client())
    destination.write("user/photo.jpg", b"different", "image/jpeg")
    manifest = tmp_path / "manifest.jsonl"
    manifest.write_text('{"key":"user/photo.jpg","status":"verified"}\n')
    with pytest.raises(MigrationConflict):
        migrate_local(source, destination, dry_run=False, manifest=manifest)
    assert destination.read("user/photo.jpg") == b"different"
    assert len(destination.client.writes) == 1


def test_verification_fails_for_missing_object_and_rejects_symlinks(tmp_path):
    source = seed_source(tmp_path)
    destination = FileSystemStorage(tmp_path / "destination")
    with pytest.raises(MigrationConflict, match="missing"):
        migrate_local(source, destination, verify_only=True)
    (source / "escape.jpg").symlink_to(tmp_path / "secret")
    with pytest.raises(ValueError, match="symlink"):
        migrate_local(source, destination)


def test_source_cannot_contain_backup_or_manifest(tmp_path):
    source = seed_source(tmp_path)
    destination = FileSystemStorage(tmp_path / "destination")
    with pytest.raises(ValueError):
        migrate_local(source, destination, backup_dir=source / "backup")
    with pytest.raises(ValueError):
        migrate_local(source, destination, manifest=source / "manifest.jsonl")
