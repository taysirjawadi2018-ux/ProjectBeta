"""documents module business rules (Structure.md §3): SQL lives in repository.py.

Upload flow (Backend.md §9): the row is INSERTed first (status 'pending'), then
a presigned PUT is returned, so a never-uploaded row is visible to the owner.
The client uploads directly to MinIO and later confirms with the sha256 of the
file it sent. Nothing here ever returns storage_key.
"""

from __future__ import annotations

from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core import storage
from app.core.errors import BadRequest, Conflict, NotFound
from app.modules.documents import repository as documents_repo
from app.modules.documents.exceptions import DocumentNotPending, VerificationIncomplete
from app.modules.documents.schemas import DocumentPresignIn
from app.modules.requests import service as requests_service

log = structlog.get_logger("watiq.documents")

# Extension is derived from the declared MIME type; magic-byte verification
# happens later in the scan worker (Backend.md §9, step 4).
_MIME_EXT: dict[str, str] = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
}


async def presign_document(
    conn: AsyncConnection,
    user_id: int,
    request_id: int,
    data: DocumentPresignIn,
) -> dict[str, Any]:
    """Register a pending row and hand out a presigned PUT for the upload.

    Authorization: the caller must own the request and it must not have reached
    a final status — RLS documents_owner_insert enforces both; the checks below
    are Layer-2 friendliness so the citizen gets a clean error instead of a
    database policy violation.
    """
    request = await requests_service.get_request(conn, request_id)
    if request is None or request.get("user_id") != user_id:
        raise NotFound("request_not_found")
    if request.get("is_final"):
        raise Conflict("request_is_final")

    ext = _MIME_EXT.get(data.mime_type)
    if ext is None:
        raise BadRequest(f"unsupported mime type: {data.mime_type}")

    key = storage.build_storage_key(ext)
    row = await documents_repo.insert_document(
        conn,
        request_id=request_id,
        storage_key=key,
        document_type=data.document_type,
        mime_type=data.mime_type,
        file_size_bytes=data.file_size_bytes,
    )
    url = await storage.generate_presigned_put(
        key, data.mime_type, data.file_size_bytes
    )
    return {"presigned_url": url, "document_id": int(row["id"])}


async def confirm_document(
    conn: AsyncConnection, user_id: int, document_id: int, checksum_sha256: str
) -> None:
    """Record the checksum of the file the client uploaded to MinIO.

    The checksum is client-supplied (the sha256 of the bytes it PUT); the scan
    worker re-verifies it against the object (Backend.md §9).
    """
    ok = await documents_repo.update_checksum(
        conn,
        document_id=document_id,
        user_id=user_id,
        checksum_sha256=checksum_sha256,
    )
    if not ok:
        raise NotFound("document_not_found")


async def download_url(conn: AsyncConnection, document_id: int) -> str:
    """Presigned GET for an authorized caller.

    The router decides *who* may call this (owner by RLS, or staff holding
    document.download); here the RLS-scoped row lookup is the authorization
    check and the short-lived URL grants nothing beyond its TTL.
    """
    doc = await documents_repo.get_document(conn, document_id)
    if doc is None:
        raise NotFound("document_not_found")
    return await storage.generate_presigned_get(str(doc["storage_key"]))


async def list_for_request(
    conn: AsyncConnection, request_id: int
) -> list[dict[str, Any]]:
    return await documents_repo.list_for_request(conn, request_id)


async def delete_document(conn: AsyncConnection, document_id: int) -> None:
    """Owner withdraws a still-pending upload.

    RLS documents_owner_delete requires status = 'pending' and ownership, so a
    verified document is safe. The database row goes first; the object in
    MinIO is deleted asynchronously by the delete_storage_object worker task —
    this service only logs that the deletion is owed.
    """
    ok = await documents_repo.delete_document(conn, document_id)
    if not ok:
        raise NotFound("document_not_found")
    log.warning(
        "storage_object_deletion_pending",
        document_id=document_id,
        message="delete_storage_object worker must purge this object",
    )


async def verify_document(
    conn: AsyncConnection, *, staff_id: int, document_id: int, status: str
) -> dict[str, Any]:
    """Staff marks a document verified or rejected.

    chk_documents_verification_complete demands verified_by and verified_at
    once the status leaves 'pending'; the repository sets both. RLS
    documents_staff_office scopes the row to the verifier's office.
    """
    if staff_id is None:
        raise VerificationIncomplete("A verifier must be identified.")

    doc = await documents_repo.get_document(conn, document_id)
    if doc is None:
        raise NotFound("document_not_found")
    if doc.get("status") != "pending":
        raise DocumentNotPending()

    row = await documents_repo.confirm_verify(
        conn, document_id=document_id, status=status, verified_by=staff_id
    )
    if row is None:
        raise NotFound("document_not_found")
    return row
