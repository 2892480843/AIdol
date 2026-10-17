import os
import tempfile
from pathlib import Path

from app.storage.base import (
    InvalidStorageKey,
    ObjectStorage,
    StoredObject,
    content_type_for_key,
    validate_key,
)


class FileSystemStorage(ObjectStorage):
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def local_path(self, key: str) -> Path:
        path = self.root / validate_key(key)
        if not path.resolve().is_relative_to(self.root):
            raise InvalidStorageKey("Storage key escapes storage root")
        return path

    def open(self, key: str) -> StoredObject:
        body = self.local_path(key).open("rb")
        return StoredObject(body, os.fstat(body.fileno()).st_size, content_type_for_key(key))

    def write(self, key: str, data: bytes, content_type: str, *, if_absent: bool = False) -> bool:
        target = self.local_path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix=".upload-", dir=target.parent)
        temporary = Path(name)
        try:
            with os.fdopen(fd, "wb") as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
            if if_absent:
                try:
                    os.link(temporary, target)
                except FileExistsError:
                    return False
            else:
                os.replace(temporary, target)
            return True
        finally:
            temporary.unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self.local_path(key).is_file()

    def delete(self, key: str) -> None:
        self.local_path(key).unlink(missing_ok=True)
