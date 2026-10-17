#!/usr/bin/env python3
"""Copy local images to private S3 storage without changing DB paths.

Dry-run is the default. Stop image writers for the final copy/verify and retain
the source volume to roll back by setting STORAGE_BACKEND=filesystem.
"""

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.config import get_settings
from app.storage import StorageUnavailableError
from app.storage.migration import MigrationConflict, migrate_local
from app.storage.s3 import S3Storage


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Local source directory (default STORAGE_PATH)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--execute", action="store_true", help="Copy missing objects and verify every byte"
    )
    mode.add_argument("--dry-run", action="store_true", help="Inspect without writing (default)")
    mode.add_argument(
        "--verify-only", action="store_true", help="Require matching remote SHA256 for all files"
    )
    parser.add_argument(
        "--create-bucket",
        action="store_true",
        help="Explicitly create missing bucket; requires --execute",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        help="Append verified objects to this JSONL file; required for --execute",
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        help="Optional additional local copy outside source; source is always retained",
    )
    args = parser.parse_args(argv)
    if args.create_bucket and not args.execute:
        parser.error("--create-bucket requires --execute")
    if args.execute and args.manifest is None:
        parser.error("--execute requires --manifest outside the source directory")

    try:
        settings = get_settings()
        destination = S3Storage.from_settings(settings)
        destination.ensure_bucket(create=args.create_bucket)
        result = migrate_local(
            args.source or settings.storage_path,
            destination,
            dry_run=not args.execute,
            verify_only=args.verify_only,
            manifest=args.manifest,
            backup_dir=args.backup_dir,
        )
    except (ValueError, MigrationConflict, StorageUnavailableError, OSError) as error:
        print(json.dumps({"status": "error", "error": str(error)}), file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "status": "verified" if args.verify_only or args.execute else "dry-run",
                "source_retained": True,
                **asdict(result),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
