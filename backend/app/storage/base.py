"""Private object storage contract shared by the API and workers."""

import mimetypes
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import BinaryIO


class InvalidStorageKey(ValueError):
    pass


class StorageUnavailableError(RuntimeError):
    """Sanitized failure safe to report without provider credentials or URLs."""


def validate_key(key: str) -> str:
    if (
        not isinstance(key, str)
        or not key
        or len(key.encode("utf-8")) > 1024
        or "\\" in key
        or ":" in key
        or any(ord(char) < 32 or ord(char) == 127 for char in key)
        or key.startswith("/")
        or any(part in ("", ".", "..") for part in key.split("/"))
        or str(PurePosixPath(key)) != key
    ):
        raise InvalidStorageKey("Invalid storage key")
    return key


def content_type_for_key(key: str) -> str:
    return mimetypes.guess_type(key)[0] or "application/octet-stream"


@dataclass
class StoredObject:
    body: BinaryIO
    size: int
    content_type: str

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.body.close()


class ObjectStorage(ABC):
    @abstractmethod
    def open(self, key: str) -> StoredObject:
        """Open a private object; the caller owns closing the returned body."""

    def read(self, key: str) -> bytes:
        with self.open(key) as obj:
            return obj.body.read()

    @abstractmethod
    def write(self, key: str, data: bytes, content_type: str, *, if_absent: bool = False) -> bool:
        """Write atomically; return False if an if_absent key already exists."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        pass

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete idempotently; failures other than absence must propagate."""

    def local_path(self, key: str) -> Path | None:
        validate_key(key)
        return None
