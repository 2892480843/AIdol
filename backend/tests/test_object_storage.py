from io import BytesIO
from unittest.mock import patch

import pytest

from app.config import Settings
from app.storage import FileSystemStorage, InvalidStorageKey, StorageUnavailableError
from app.storage.s3 import S3Storage, _client_for_config, _after_fork


class S3Error(Exception):
    def __init__(self, code):
        self.response = {"Error": {"Code": code}}
        super().__init__("provider diagnostic must not leak credentials")


class FakeS3Client:
    """The network boundary only; all storage and image behavior stays real."""

    def __init__(self):
        self.objects = {}
        self.writes = []
        self.bodies = []

    def put_object(self, **kwargs):
        key = kwargs["Key"]
        if key in self.objects and kwargs.get("IfNoneMatch") == "*":
            raise S3Error("PreconditionFailed")
        self.writes.append(kwargs)
        body = kwargs["Body"]
        self.objects[key] = {
            "data": body.read() if hasattr(body, "read") else body,
            "ContentType": kwargs["ContentType"],
            "Metadata": kwargs.get("Metadata", {}),
        }

    def get_object(self, **kwargs):
        if kwargs["Key"] not in self.objects:
            raise S3Error("NoSuchKey")
        obj = self.objects[kwargs["Key"]]
        body = BytesIO(obj["data"])
        self.bodies.append(body)
        return {"Body": body, "ContentLength": len(obj["data"]), **obj}

    def head_object(self, **kwargs):
        if kwargs["Key"] not in self.objects:
            raise S3Error("404")
        obj = self.objects[kwargs["Key"]]
        return {"ContentLength": len(obj["data"]), **obj}

    def delete_object(self, **kwargs):
        self.objects.pop(kwargs["Key"], None)


@pytest.fixture(params=["filesystem", "s3"])
def storage(request, tmp_path):
    if request.param == "filesystem":
        return FileSystemStorage(tmp_path)
    return S3Storage(bucket="wardrobe", client=FakeS3Client())


@pytest.mark.parametrize(
    "key",
    ["../a.jpg", "/a.jpg", "u/../a.jpg", "u//a.jpg", "u/./a.jpg", "u\\a.jpg", "", "u/a\x00.jpg"],
)
def test_rejects_noncanonical_keys_before_any_access(storage, key):
    with pytest.raises(InvalidStorageKey):
        storage.write(key, b"secret", "image/jpeg")
    with pytest.raises(InvalidStorageKey):
        storage.read(key)
    with pytest.raises(InvalidStorageKey):
        storage.delete(key)


def test_roundtrip_conditional_write_and_idempotent_delete(storage):
    key = "user/photo.jpg"
    assert storage.write(key, b"first", "image/jpeg", if_absent=True)
    assert not storage.write(key, b"replacement", "image/jpeg", if_absent=True)
    assert storage.read(key) == b"first"
    with storage.open(key) as obj:
        assert obj.content_type == "image/jpeg"
        assert obj.size == 5
        assert obj.body.read() == b"first"
    storage.delete(key)
    storage.delete(key)
    assert not storage.exists(key)
    with pytest.raises(FileNotFoundError):
        storage.read(key)


def test_filesystem_rejects_symlink_escape(tmp_path):
    root = tmp_path / "storage"
    root.mkdir()
    (root / "escape").symlink_to(tmp_path, target_is_directory=True)
    with pytest.raises(InvalidStorageKey):
        FileSystemStorage(root).write("escape/private.jpg", b"x", "image/jpeg")


def test_s3_never_adds_public_acl_and_closes_body():
    client = FakeS3Client()
    storage = S3Storage(bucket="wardrobe", client=client)
    storage.write("user/photo.png", b"png", "image/png")
    assert "ACL" not in client.writes[0]
    assert client.writes[0]["ContentType"] == "image/png"
    assert storage.read("user/photo.png") == b"png"
    assert client.bodies[-1].closed


def test_s3_permission_error_is_not_misreported_as_missing():
    class ForbiddenClient(FakeS3Client):
        def head_object(self, **kwargs):
            raise S3Error("403")

    storage = S3Storage(bucket="wardrobe", client=ForbiddenClient())
    with pytest.raises(StorageUnavailableError) as error:
        storage.exists("user/photo.jpg")
    assert "provider diagnostic" not in str(error.value)


def test_s3_sdk_is_bounded_and_does_not_probe_or_create_buckets_on_startup():
    settings = Settings(
        s3_bucket="wardrobe",
        s3_endpoint_url="object-store:9000",
        s3_secure=False,
        s3_access_key="test-access",
        s3_secret_key="test-secret",
        s3_max_attempts=4,
    )
    with patch("boto3.session.Session.client") as constructor:
        S3Storage.from_settings(settings)
    arguments = constructor.call_args.kwargs
    assert arguments["endpoint_url"] == "http://object-store:9000"
    assert arguments["config"].retries == {"mode": "standard", "total_max_attempts": 4}
    assert arguments["config"].connect_timeout == 5
    assert arguments["config"].read_timeout == 30
    assert arguments["config"].s3 == {"addressing_style": "path"}
    assert not constructor.return_value.head_bucket.called
    assert not constructor.return_value.create_bucket.called
    assert "test-secret" not in repr(settings)


def test_s3_stream_failure_is_sanitized_and_closed():
    class BrokenBody(BytesIO):
        def read(self, *args):
            raise RuntimeError("credential-value must not appear in logs")

    class BrokenClient(FakeS3Client):
        def get_object(self, **kwargs):
            self.body = BrokenBody(b"data")
            return {"Body": self.body, "ContentLength": 4, "ContentType": "image/jpeg"}

    client = BrokenClient()
    with pytest.raises(StorageUnavailableError, match="stream read failed") as error:
        S3Storage(bucket="wardrobe", client=client).read("user/photo.jpg")
    assert client.body.closed
    assert "credential-value" not in str(error.value)


def test_s3_reuses_connection_client_for_equivalent_settings():
    settings = Settings(s3_bucket="perf-test", s3_endpoint_url="http://perf-s3:9000",
                        s3_access_key="perf-access", s3_secret_key="perf-secret", s3_secure=False)
    with patch("boto3.session.Session.client") as constructor:
        first = S3Storage.from_settings(settings)
        second = S3Storage.from_settings(settings.model_copy())
    assert first.client is second.client
    assert constructor.call_count == 1


@pytest.fixture(autouse=True)
def clear_sdk_clients():
    _client_for_config.cache_clear()
    yield
    _client_for_config.cache_clear()


@pytest.mark.parametrize("field,value", [
    ("s3_endpoint_url", "http://different-store:9000"),
    ("s3_access_key", "new-access"), ("s3_secret_key", "new-secret"),
    ("s3_region", "other-region"), ("s3_secure", True),
    ("s3_addressing_style", "virtual"), ("s3_connect_timeout", 7),
    ("s3_read_timeout", 45), ("s3_max_attempts", 5),
])
def test_s3_connection_reuse_isolates_every_connection_setting(field, value):
    settings = Settings(s3_bucket="wardrobe", s3_endpoint_url="http://test-store:9000",
                        s3_access_key="access", s3_secret_key="secret", s3_secure=False)
    with patch("boto3.session.Session.client", side_effect=lambda *a, **kw: object()) as constructor:
        first = S3Storage.from_settings(settings)
        second = S3Storage.from_settings(settings.model_copy(update={field: value}))
    assert first.client is not second.client
    assert constructor.call_count == 2


def test_s3_shared_client_keeps_buckets_separate_and_resets_after_fork():
    settings = Settings(s3_bucket="one", s3_endpoint_url="http://test-store:9000",
                        s3_access_key="access", s3_secret_key="secret", s3_secure=False)
    with patch("boto3.session.Session.client", side_effect=lambda *a, **kw: object()) as constructor:
        first = S3Storage.from_settings(settings)
        second = S3Storage.from_settings(settings.model_copy(update={"s3_bucket": "two"}))
        assert first.client is second.client
        assert (first.bucket, second.bucket) == ("one", "two")
        _after_fork()
        third = S3Storage.from_settings(settings)
        assert third.client is not first.client
        assert constructor.call_count == 2


def test_s3_concurrent_initialization_constructs_only_one_client():
    from concurrent.futures import ThreadPoolExecutor
    settings = Settings(s3_bucket="one", s3_endpoint_url="http://test-store:9000",
                        s3_access_key="access", s3_secret_key="secret", s3_secure=False)
    with patch("boto3.session.Session.client", side_effect=lambda *a, **kw: object()) as constructor:
        with ThreadPoolExecutor(max_workers=8) as executor:
            stores = list(executor.map(lambda _: S3Storage.from_settings(settings), range(20)))
    assert all(store.client is stores[0].client for store in stores)
    assert constructor.call_count == 1
