"""HTTP only: document endpoints (Structure.md §3).

Citizens reach their own requests' documents (RLS documents_owner_*); staff
reach their office's (documents_staff_office) and additionally need the
document.* permissions at Layer 2. require_mfa guards staff access to citizen
PII. The storage_key is never serialized — only short-lived presigned URLs are
returned (Backend.md §9).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.deps import CurrentUser, DbConn, require_mfa, require_permission
from app.core.errors import Forbidden, Unauthorized
from app.core.principal import Principal
from app.modules.documents import service as documents_service
from app.modules.documents.schemas import (
    DocumentConfirmIn,
    DocumentOut,
    DocumentPresignIn,
    PresignOut,
    VerifyIn,
)

router = APIRouter(prefix="/api/v1", tags=["documents"])


def _require_staff_mfa(principal: Principal) -> None:
    """Staff browsing citizen PII must have satisfied MFA (Backend.md §6.4)."""
    if principal.is_staff and not principal.mfa_satisfied:
        raise Forbidden("mfa_required")


def _require_staff_permission(principal: Principal, code: str) -> None:
    _require_staff_mfa(principal)
    if principal.is_staff and code not in principal.permissions:
        raise Forbidden(f"missing permission: {code}")


@router.post(
    "/requests/{request_id}/documents/presign",
    status_code=201,
    response_model=PresignOut,
)
async def presign_document(
    request_id: int,
    body: DocumentPresignIn,
    conn: DbConn,
    principal: CurrentUser,
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return await documents_service.presign_document(
        conn, principal.user_id, request_id, body
    )


@router.get(
    "/requests/{request_id}/documents", response_model=list[DocumentOut]
)
async def list_documents(
    request_id: int, conn: DbConn, principal: CurrentUser
) -> Any:
    if not principal.is_authenticated:
        raise Unauthorized("authentication_required")
    _require_staff_permission(principal, "document.view")
    return await documents_service.list_for_request(conn, request_id)


@router.post("/documents/{document_id}/confirm", status_code=204)
async def confirm_document(
    document_id: int, body: DocumentConfirmIn, conn: DbConn, principal: CurrentUser
) -> None:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    await documents_service.confirm_document(
        conn, principal.user_id, document_id, body.checksum_sha256
    )
    return None


@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: int, conn: DbConn, principal: CurrentUser
) -> Any:
    """Owner (RLS) or staff with document.download; returns a 300s presigned
    GET. The storage_key itself never leaves the server (Backend.md §9)."""
    if not principal.is_authenticated:
        raise Unauthorized("authentication_required")
    _require_staff_permission(principal, "document.download")
    url = await documents_service.download_url(conn, document_id)
    return {"presigned_url": url}


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: int, conn: DbConn, principal: CurrentUser
) -> None:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    await documents_service.delete_document(conn, document_id)
    return None


@router.patch("/documents/{document_id}/verify", response_model=DocumentOut)
async def verify_document(
    document_id: int,
    body: VerifyIn,
    conn: DbConn,
    principal: CurrentUser,
    _perm: Annotated[Principal, Depends(require_permission("document.verify"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
) -> Any:
    if principal.staff_id is None:
        raise Unauthorized("staff_authentication_required")
    return await documents_service.verify_document(
        conn, staff_id=principal.staff_id, document_id=document_id,
        status=body.status,
    )
