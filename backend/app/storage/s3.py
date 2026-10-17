import hashlib
from typing import Any

from app.storage.base import ObjectStorage, StorageUnavailableError, StoredObject, validate_key


def _error_code(error: Exception) -> str:
    return str(getattr(error, "response", {}).get("Error", {}).get("Code", ""))


class _PrivateBody:
    def __init__(self, body):
        self.body = body

    def read(self, size: int = -1) -> bytes:
        try:
            return self.body.read(size)
        except Exception:
            raise StorageUnavailableError("Object storage stream read failed") from None

    def close(self) -> None:
        self.body.close()


class S3Storage(ObjectStorage):
    def __init__(self, *, bucket: str, client: Any):
        if not bucket:
            raise ValueError("S3_BUCKET must be configured for S3 storage")
        self.bucket = bucket
        self.client = client

    @classmethod
    def from_settings(cls, settings):
        if not settings.s3_bucket:
            raise ValueError("S3_BUCKET must be configured for S3 storage")
        # Filesystem deployments do not import or initialize an AWS SDK client.
        import boto3
        from botocore.config import Config

        if bool(settings.s3_access_key) != bool(settings.s3_secret_key):
            raise ValueError("S3_ACCESS_KEY and S3_SECRET_KEY must be set together")
        endpoint = settings.s3_endpoint_url
        if endpoint and "://" not in endpoint:
            endpoint = f"{'https' if settings.s3_secure else 'http'}://{endpoint}"
        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            use_ssl=settings.s3_secure,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": settings.s3_addressing_style},
                connect_timeout=settings.s3_connect_timeout,
                read_timeout=settings.s3_read_timeout,
                retries={"mode": "standard", "total_max_attempts": settings.s3_max_attempts},
                # Keep requests compatible with S3 providers without AWS's new
                # optional checksum/trailer extensions.
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )
        return cls(bucket=settings.s3_bucket, client=client)

    def open(self, key: str) -> StoredObject:
        key = validate_key(key)
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return StoredObject(
                _PrivateBody(response["Body"]),
                response["ContentLength"],
                response.get("ContentType", "application/octet-stream"),
            )
        except Exception as error:
            if _error_code(error) in ("NoSuchKey", "NotFound", "404"):
                raise FileNotFoundError(key) from None
            raise StorageUnavailableError("Object storage read failed") from None

    def write(self, key: str, data: bytes, content_type: str, *, if_absent: bool = False) -> bool:
        key = validate_key(key)
        arguments = {
            "Bucket": self.bucket,
            "Key": key,
            "Body": data,
            "ContentType": content_type,
            "Metadata": {"sha256": hashlib.sha256(data).hexdigest()},
        }
        if if_absent:
            arguments["IfNoneMatch"] = "*"
        try:
            self.client.put_object(**arguments)
            return True
        except Exception as error:
            if if_absent and _error_code(error) in ("PreconditionFailed", "412"):
                return False
            raise StorageUnavailableError("Object storage write failed") from None

    def exists(self, key: str) -> bool:
        key = validate_key(key)
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as error:
            if _error_code(error) in ("NoSuchKey", "NotFound", "404"):
                return False
            raise StorageUnavailableError("Object storage metadata lookup failed") from None

    def delete(self, key: str) -> None:
        key = validate_key(key)
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception:
            raise StorageUnavailableError("Object storage delete failed") from None

    def ensure_bucket(self, *, create: bool = False) -> None:
        """Only the explicit migration command may create a bucket."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception as error:
            if create and _error_code(error) in ("NoSuchBucket", "NotFound", "404"):
                arguments = {"Bucket": self.bucket}
                region = getattr(getattr(self.client, "meta", None), "region_name", "us-east-1")
                if region and region != "us-east-1":
                    arguments["CreateBucketConfiguration"] = {"LocationConstraint": region}
                try:
                    self.client.create_bucket(**arguments)
                    return
                except Exception:
                    raise StorageUnavailableError("Object storage bucket creation failed") from None
            raise StorageUnavailableError("Object storage bucket is unavailable") from None
