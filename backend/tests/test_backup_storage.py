import json

import pytest

from app.config import get_settings
from scripts.backup_storage import export_images


@pytest.fixture
def backup_source(tmp_path, monkeypatch):
    source = tmp_path / "source"
    (source / "owner").mkdir(parents=True)
    (source / "owner" / "image.jpg").write_bytes(b"synthetic image")
    monkeypatch.setattr(get_settings(), "storage_backend", "filesystem")
    monkeypatch.setattr(get_settings(), "storage_path", str(source))
    return source


def test_backup_exports_verified_bytes_without_removing_source(backup_source, tmp_path):
    result = export_images(tmp_path / "backup" / "images")
    assert result == {"objects": 1, "verified": True}
    assert (backup_source / "owner" / "image.jpg").read_bytes() == b"synthetic image"
    assert (tmp_path / "backup/images/owner/image.jpg").read_bytes() == b"synthetic image"
    assert json.loads((tmp_path / "backup/images-manifest.json").read_text())["objects"] == 1


def test_backup_refuses_conflicting_destination(backup_source, tmp_path):
    target = tmp_path / "backup/images/owner"
    target.mkdir(parents=True)
    (target / "image.jpg").write_bytes(b"preserved original")
    with pytest.raises(RuntimeError, match="verification"):
        export_images(target.parent)
    assert (target / "image.jpg").read_bytes() == b"preserved original"


def test_backup_cannot_recurse_into_source(backup_source):
    with pytest.raises(ValueError, match="outside"):
        export_images(backup_source / "backup")
