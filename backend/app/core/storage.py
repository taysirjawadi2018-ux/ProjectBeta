"""MinIO / S3 presigned URL generation (Security.md §8.3, Backend.md §9).

The bucket is private and anonymous access is explicitly denied; objects are
reached only through short-lived presigned URLs issued AFTER an authorization
check, and the URL grants nothing beyond the TTL.
"""

from __future__ import annotations

from collections.abc import Sequence
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from app.core.config import get_settings
from app.core.errors import ServiceUnavailable


@asynccontextmanager
async def _s3_client() -> Any:
    """Lazily created per-use aioboto3 client; connections are short-lived."""
    import aioboto3  # imported here: only needed for storage operations
    from botocore.config import Config

    s = get_settings()
    session = aioboto3.Session()
    async with session.client(
        "s3",
        endpoint_url=s.s3_endpoint,
        aws_access_key_id=s.s3_access_key.get_secret_value(),
        aws_secret_access_key=s.s3_secret_key.get_secret_value(),
        region_name="us-east-1",
        config=Config(
            connect_timeout=5,
            read_timeout=10,
            signature_version="s3v4",
            retries={"max_attempts": 2},
        ),
    ) as client:
        yield client


def _bucket() -> str:
    return get_settings().s3_bucket_documents


async def generate_presigned_put(
    key: str,
    content_type: str,
    max_bytes: int | None = None,
    ttl_seconds: int = 300,
) -> str:
    """Presigned PUT with a hard content-length-range condition.

    The client uploads directly to MinIO; the row is registered afterwards
    (Backend.md §9).
    """
    s = get_settings()
    conditions: list[Any] = []
    if max_bytes is None:
        max_bytes = s.max_upload_bytes
    conditions.append(["content-length-range", 1, max_bytes])
    try:
        async with _s3_client() as client:
            url = await client.generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": _bucket(),
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=ttl_seconds,
                Conditions=conditions,
            )
    except Exception:
        raise ServiceUnavailable("storage_unavailable") from None
    return str(url)


async def generate_presigned_get(key: str, ttl_seconds: int | None = None) -> str:
    s = get_settings()
    try:
        async with _s3_client() as client:
            url = await client.generate_presigned_url(
                "get_object",
                Params={"Bucket": _bucket(), "Key": key},
                ExpiresIn=ttl_seconds or s.presigned_get_ttl_seconds,
            )
    except Exception:
        raise ServiceUnavailable("storage_unavailable") from None
    return str(url)


async def delete_objects(keys: Sequence[str]) -> None:
    """Idempotent bulk delete. Used by anonymization (Backend.md §7.4)."""
    if not keys:
        return
    try:
        async with _s3_client() as client:
            await client.delete_objects(
                Bucket=_bucket(),
                Delete={"Objects": [{"Key": k} for k in keys]},
            )
    except Exception:
        raise ServiceUnavailable("storage_unavailable") from None


async def read_object(key: str, max_bytes: int | None = None) -> bytes:
    """Fetch an object server-side — the scan worker's path (Backend.md §9).

    The worker downloads the citizen's upload to scan it, so this enforces a
    hard size cap (default: the same limit the presigned PUT accepted) before
    anything touches memory. Not for response streaming — that is presigned
    URLs only.
    """
    if max_bytes is None:
        max_bytes = get_settings().max_upload_bytes
    try:
        async with _s3_client() as client:
            response = await client.get_object(Bucket=_bucket(), Key=key)
            async with response["Body"] as body:
                raw = await body.read(max_bytes + 1)
    except Exception:
        raise ServiceUnavailable("storage_unavailable") from None
    data = bytes(raw)
    if len(data) > max_bytes:
        raise ValueError(f"object exceeds {max_bytes} bytes")
    return data


async def put_object(key: str, data: bytes, content_type: str) -> None:
    """Server-side write. Only the scan worker uses this, to replace an image
    with its EXIF-stripped copy (Backend.md §9 step 4); citizens always upload
    through presigned URLs."""
    try:
        async with _s3_client() as client:
            await client.put_object(
                Bucket=_bucket(),
                Key=key,
                Body=data,
                ContentType=content_type,
            )
    except Exception:
        raise ServiceUnavailable("storage_unavailable") from None


def build_storage_key(ext: str, now: datetime | None = None) -> str:
    """Server-generated key: requests/{yyyy}/{mm}/{uuid4}.{ext}.

    Path traversal, collisions, and enumeration all die here (Security.md §8.3).
    """
    import uuid

    ts = now or datetime.now(UTC)
    return f"requests/{ts.year}/{ts.month:02d}/{uuid.uuid4()}.{ext}"
