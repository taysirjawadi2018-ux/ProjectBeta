"""scan_document: magic bytes, ClamAV, checksum, EXIF strip (Backend.md §9).

Pipeline, per Backend.md §9 step 4:

1. Download the object server-side (hard size cap — the same limit the
   presigned PUT accepted).
2. Re-verify the sha256 the client reported in confirm_document.
3. Verify magic bytes against the declared MIME type (never trust the
   extension; the extension was derived from the MIME type anyway).
4. ClamAV scan when clamd_host is configured (INSTREAM protocol).
5. Strip EXIF from images and re-upload; the stored checksum is updated to
   the stripped bytes' hash so the column always means "hash of the object".

Reject (bad magic, checksum mismatch, infected) = delete the object, hard-
delete the row, raise a security event. Clean = stays 'pending' for the
staff verifier — no database change at all.

Any storage/DB failure propagates: ARQ retries with backoff, and the job is
idempotent — a retry after a reject simply finds no row (not_found).
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import io
from typing import Any

import structlog

from app.core import storage
from app.core.config import get_settings
from app.core.db import rls_transaction
from app.core.principal import DbRole, Principal
from app.core.telemetry import DOCUMENT_SCAN_REJECTIONS
from app.workers.tasks import JobContext, tracked

log = structlog.get_logger("watiq.workers.documents")

_WORKER_PRINCIPAL = Principal(db_role=DbRole.ADMIN)

_MAX_INSTREAM_CHUNK = 4096


@tracked("scan_document")
async def scan_document(ctx: JobContext, document_id: int) -> dict[str, Any]:
    """Scan one upload after its checksum confirmation."""
    from app.modules.documents import repository as documents_repo

    async with rls_transaction(_WORKER_PRINCIPAL) as conn:
        doc = await documents_repo.get_document(conn, document_id)

    if doc is None:
        return {"document_id": document_id, "outcome": "not_found"}
    if doc.get("status") != "pending":
        return {"document_id": document_id, "outcome": "skipped", "reason": doc.get("status")}
    if not doc.get("checksum_sha256"):
        # Client never confirmed the upload; nothing to scan. The owner's
        # pending row remains visible and the staff queue can flag it.
        return {"document_id": document_id, "outcome": "skipped", "reason": "no_checksum"}

    key = str(doc["storage_key"])
    mime = str(doc["mime_type"])
    declared = str(doc["checksum_sha256"])

    try:
        data = await storage.read_object(key)
    except ValueError:
        await _reject(documents_repo, doc, key, "size_mismatch")
        return {"document_id": document_id, "outcome": "rejected", "reason": "size_mismatch"}

    actual = hashlib.sha256(data).hexdigest()
    if actual != declared:
        await _reject(documents_repo, doc, key, "checksum_mismatch")
        return {"document_id": document_id, "outcome": "rejected", "reason": "checksum_mismatch"}

    detected_mime = _magic_mime(data)
    if detected_mime != mime:
        await _reject(documents_repo, doc, key, "magic_bytes_mismatch")
        return {"document_id": document_id, "outcome": "rejected", "reason": "magic_bytes_mismatch"}

    if (
        settings_clamd := get_settings().clamd_host
    ) and not await _clamav_clean(settings_clamd, data):
        await _reject(documents_repo, doc, key, "infected")
        return {"document_id": document_id, "outcome": "rejected", "reason": "infected"}
    if mime.startswith("image/"):
        stripped, stripped_hash = _strip_exif(data)
        if stripped is not None and stripped_hash != actual:
            await storage.put_object(key, stripped, mime)
            async with rls_transaction(_WORKER_PRINCIPAL) as conn:
                await documents_repo.update_checksum_stored(
                    conn, document_id=document_id, checksum_sha256=stripped_hash,
                )
            log.info("document_exif_stripped", document_id=document_id)

    log.info("document_scan_clean", document_id=document_id)
    return {"document_id": document_id, "outcome": "clean"}


async def _reject(documents_repo: Any, doc: dict[str, Any], key: str, reason: str) -> None:
    """Delete object + row, raise the security event. Never raises."""
    document_id = int(doc["id"])
    try:
        await storage.delete_objects([key])
    except Exception:
        log.exception("rejected_object_delete_failed", document_id=document_id)
    try:
        async with rls_transaction(_WORKER_PRINCIPAL) as conn:
            await documents_repo.hard_delete_document(conn, document_id)
    except Exception:
        log.exception("rejected_row_delete_failed", document_id=document_id)
    DOCUMENT_SCAN_REJECTIONS.labels(reason=reason).inc()
    log.critical(
        "document_scan_rejected",
        document_id=document_id,
        reason=reason,
        storage_key=key,
        event="security",
    )


def _magic_mime(data: bytes) -> str:
    import magic

    try:
        return str(magic.from_buffer(data, mime=True))
    except Exception:
        return "application/octet-stream"


def _strip_exif(data: bytes) -> tuple[bytes | None, str]:
    """Return (stripped_bytes, sha256) for images carrying EXIF, else (None, orig_hash)."""
    from PIL import Image, ImageOps

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return None, ""
    if not img.getexif() and not getattr(img, "getxmp", lambda: None)():
        return None, ""
    stripped = io.BytesIO()
    fmt = img.format or "JPEG"
    if fmt == "JPEG":
        ImageOps.exif_transpose(img).save(stripped, format="JPEG", quality=95)
    else:
        img.save(stripped, format=fmt)
    out = stripped.getvalue()
    return out, hashlib.sha256(out).hexdigest()


async def _clamav_clean(host: str, data: bytes) -> bool:
    """Minimal ClamAV INSTREAM scan over TCP. A connection failure is treated
    as UNKNOWN, not clean: the job retries and the file stays pending."""
    hostname, _, port = host.rpartition(":")
    reader, writer = await asyncio.open_connection(
        hostname or host, int(port) if port else 3310,
    )
    try:
        writer.write(b"zINSTREAM\x00")
        offset = 0
        while offset < len(data):
            chunk = data[offset:offset + _MAX_INSTREAM_CHUNK]
            writer.write(len(chunk).to_bytes(4, "big") + chunk)
            offset += _MAX_INSTREAM_CHUNK
        writer.write((0).to_bytes(4, "big"))
        await writer.drain()
        response = await reader.read(1024)
        text = response.decode("utf-8", errors="replace")
        if text.startswith("stream: FOUND"):
            log.critical("clamav_found_malware")
            return False
        return text.startswith("stream: OK")
    finally:
        writer.close()
        with contextlib.suppress(OSError):
            await writer.wait_closed()