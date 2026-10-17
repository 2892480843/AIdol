from app.storage.base import (
    InvalidStorageKey,
    ObjectStorage,
    StorageUnavailableError,
    StoredObject,
    content_type_for_key,
    validate_key,
)
from app.storage.filesystem import FileSystemStorage


def create_storage(settings=None) -> ObjectStorage:
    if settings is None:
        from app.config import get_settings

        settings = get_settings()
    if settings.storage_backend == "filesystem":
        return FileSystemStorage(settings.storage_path)
    from app.storage.s3 import S3Storage

    return S3Storage.from_settings(settings)


__all__ = [
    "FileSystemStorage",
    "InvalidStorageKey",
    "ObjectStorage",
    "StorageUnavailableError",
    "StoredObject",
    "content_type_for_key",
    "create_storage",
    "validate_key",
]
