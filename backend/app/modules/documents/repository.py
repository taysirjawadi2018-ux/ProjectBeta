"""SQL only (Structure.md §3). Named text() constants, never inline SQL.

Citizen rows are scoped by documents_owner_* (owner via the requests join,
and insert/delete gated on the request still being open / the document still
pending); staff rows by documents_staff_office. All identity comes from the
session GUCs — never from a WHERE clause this repository invents.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_INSERT_DOCUMENT = text(
    """
    INSERT INTO documents (request_id, storage_key, document_type, mime_type,
                           file_size_bytes, status)
    VALUES (:request_id, :storage_key, :document_type, :mime_type,
            :file_size_bytes, 'pending')
    RETURNING id, uploaded_at
    """
)

_LIST_FOR_REQUEST = text(
    """
    SELECT id, document_type, mime_type, file_size_bytes, status,
           uploaded_at, verified_at
      FROM documents
     WHERE request_id = :request_id
     ORDER BY id
    """
)

# storage_key is fetched internally for presigned GET generation but must never
# be serialized by the service layer (Backend.md §9).
_GET_DOCUMENT = text(
    """
    SELECT id, request_id, storage_key, document_type, mime_type,
           file_size_bytes, checksum_sha256, status, verified_by, verified_at,
           uploaded_at
      FROM documents
     WHERE id = :document_id
    """
)

# Owner gate is the requests join; RLS (documents_owner_select) is the same
# check at the policy layer.
_UPDATE_CHECKSUM = text(
    """
    UPDATE documents d
       SET checksum_sha256 = :checksum_sha256
      FROM requests r
     WHERE d.id = :document_id
       AND r.id = d.request_id
       AND r.user_id = :user_id
    """
)

# chk_documents_verification_complete requires verified_by + verified_at
# whenever the status leaves 'pending' — both are set here.
_CONFIRM_VERIFY = text(
    """
    UPDATE documents
       SET status = :status,
           verified_by = :verified_by,
           verified_at = CURRENT_TIMESTAMP
     WHERE id = :document_id
    RETURNING id, document_type, mime_type, file_size_bytes, status,
              uploaded_at, verified_at
    """
)

# RLS documents_owner_delete already requires status = 'pending' and owner.
_DELETE_DOCUMENT = text(
    """
    DELETE FROM documents
     WHERE id = :document_id
    """
)

# Worker-only (Backend.md §9 step 4): the scan job removes a rejected upload
# outright — any status, no ownership clause. watiq_admin's FOR ALL policy is
# the authority, and only the ARQ job (admin engine) ever runs this.
_HARD_DELETE_DOCUMENT = text(
    """
    DELETE FROM documents
     WHERE id = :document_id
    """
)


# Worker-only (Backend.md §9): the scan job rewrites the checksum after EXIF
# stripping, so the column always means "sha256 of the stored object". Admin
# engine, no ownership clause — the admin FOR ALL policy is the authority.
_UPDATE_CHECKSUM_STORED = text(
    """
    UPDATE documents
       SET checksum_sha256 = :checksum_sha256
     WHERE id = :document_id
    """
)


async def insert_document(
    conn: AsyncConnection,
    *,
    request_id: int,
    storage_key: str,
    document_type: str,
    mime_type: str,
    file_size_bytes: int,
) -> dict[str, Any]:
    row = (
        await conn.execute(
            _INSERT_DOCUMENT,
            {
                "request_id": request_id,
                "storage_key": storage_key,
                "document_type": document_type,
                "mime_type": mime_type,
                "file_size_bytes": file_size_bytes,
            },
        )
    ).first()
    if row is None:
        return {}
    return {"id": int(row.id), "uploaded_at": row.uploaded_at}


async def list_for_request(
    conn: AsyncConnection, request_id: int
) -> list[dict[str, Any]]:
    rows = await conn.execute(_LIST_FOR_REQUEST, {"request_id": request_id})
    return [dict(r) for r in rows]


async def get_document(
    conn: AsyncConnection, document_id: int
) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_DOCUMENT, {"document_id": document_id})).first()
    return dict(row) if row else None


async def update_checksum(
    conn: AsyncConnection, *, document_id: int, user_id: int, checksum_sha256: str
) -> bool:
    result = await conn.execute(
        _UPDATE_CHECKSUM,
        {
            "document_id": document_id,
            "user_id": user_id,
            "checksum_sha256": checksum_sha256,
        },
    )
    return result.rowcount > 0


async def confirm_verify(
    conn: AsyncConnection, *, document_id: int, status: str, verified_by: int
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _CONFIRM_VERIFY,
            {
                "document_id": document_id,
                "status": status,
                "verified_by": verified_by,
            },
        )
    ).first()
    return dict(row) if row else None


async def delete_document(conn: AsyncConnection, document_id: int) -> bool:
    result = await conn.execute(_DELETE_DOCUMENT, {"document_id": document_id})
    return result.rowcount > 0


async def hard_delete_document(conn: AsyncConnection, document_id: int) -> bool:
    result = await conn.execute(_HARD_DELETE_DOCUMENT, {"document_id": document_id})
    return result.rowcount > 0


async def update_checksum_stored(
    conn: AsyncConnection, *, document_id: int, checksum_sha256: str,
) -> None:
    await conn.execute(
        _UPDATE_CHECKSUM_STORED,
        {"document_id": document_id, "checksum_sha256": checksum_sha256},
    )
