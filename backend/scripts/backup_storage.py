"""Export and verify private images to an empty directory without deleting source."""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings
from app.storage import FileSystemStorage, create_storage, validate_key


def export_images(destination: Path) -> dict:
    settings = get_settings()
    source = create_storage(settings)
    if settings.storage_backend == "filesystem" and destination.resolve().is_relative_to(
        source.root
    ):
        raise ValueError("Backup output must be outside the image storage directory")
    target = FileSystemStorage(destination)
    if settings.storage_backend == "s3":
        pages = source.client.get_paginator("list_objects_v2").paginate(Bucket=source.bucket)
        keys = (row["Key"] for page in pages for row in page.get("Contents", []))
    else:
        keys = (
            path.relative_to(source.root).as_posix()
            for path in source.root.rglob("*")
            if path.is_file()
        )
    manifest = []
    for key in keys:
        validate_key(key)
        with source.open(key) as obj:
            data = obj.body.read()
            target.write(key, data, obj.content_type, if_absent=True)
        digest = hashlib.sha256(data).hexdigest()
        if hashlib.sha256(target.read(key)).hexdigest() != digest:
            raise RuntimeError("Backup image verification failed")
        manifest.append({"key": key, "bytes": len(data), "sha256": digest})
    document = {
        "storage_backend": settings.storage_backend,
        "objects": len(manifest),
        "files": manifest,
    }
    (destination.parent / "images-manifest.json").write_text(json.dumps(document, indent=2) + "\n")
    return {"objects": len(manifest), "verified": True}


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    arguments = parser.parse_args()
    print(json.dumps(export_images(arguments.output)))
