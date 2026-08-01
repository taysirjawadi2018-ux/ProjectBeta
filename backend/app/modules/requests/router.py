"""HTTP only: citizen and staff request endpoints (Structure.md §3).

Citizen rows are scoped by RLS (requests_owner_*); staff rows by office
(requests_staff_office). Layer-2 `require_permission` gives a clean 403 and
`require_mfa` guards endpoints that touch citizen PII — both are duplicated
inside RLS, which holds if Layer 2 is ever forgotten.

Route order matters: /track/{code}, /office/queue and /office are declared
before /{request_id} so the path parameters never capture them.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query

from app.core.deps import CurrentUser, DbConn, require_mfa, require_permission
from app.core.errors import Forbidden, NotFound, Unauthorized
from app.core.pagination import page_size
from app.core.principal import Principal
from app.modules.requests import service as requests_service
from app.modules.requests.schemas import (
    HistoryOut,
    OfficePage,
    RequestCreateIn,
    RequestOut,
    RequestsPage,
    StatusUpdateIn,
    TrackOut,
)

router = APIRouter(prefix="/api/v1/requests", tags=["requests"])


def _require_staff_permission(principal: Principal, code: str) -> None:
    """Layer-2 gate for endpoints that serve both owners and staff."""
    if principal.is_staff:
        if not principal.mfa_satisfied:
            raise Forbidden("mfa_required")
        if code not in principal.permissions:
            raise Forbidden(f"missing permission: {code}")


@router.post("", status_code=201, response_model=RequestOut)
async def create_request(
    body: RequestCreateIn, conn: DbConn, principal: CurrentUser
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return await requests_service.create_request(conn, principal.user_id, body)


@router.get("", response_model=RequestsPage)
async def list_my_requests(
    conn: DbConn,
    principal: CurrentUser,
    cursor: str | None = Query(default=None, max_length=512),
    size: int | None = Query(default=None, ge=1, le=100),
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    return await requests_service.list_my(
        conn, principal.user_id, cursor=cursor, limit=page_size(size)
    )


@router.get("/track/{tracking_code}", response_model=TrackOut)
async def track_request(
    conn: DbConn,
    tracking_code: str = Path(min_length=1, max_length=50),
) -> Any:
    row = await requests_service.track_by_code(conn, tracking_code)
    if row is None:
        raise NotFound("request_not_found")
    return row


@router.get("/office/queue", response_model=OfficePage)
async def office_queue(
    conn: DbConn,
    principal: CurrentUser,
    _perm: Annotated[Principal, Depends(require_permission("request.view"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
    cursor: str | None = Query(default=None, max_length=512),
    size: int | None = Query(default=None, ge=1, le=100),
) -> Any:
    if principal.staff_id is None:
        raise Unauthorized("staff_authentication_required")
    return await requests_service.list_office_queue(
        conn, cursor=cursor, limit=page_size(size)
    )


@router.get("/office", response_model=OfficePage)
async def list_office_requests(
    conn: DbConn,
    principal: CurrentUser,
    _perm: Annotated[Principal, Depends(require_permission("request.view"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
    status: str | None = Query(default=None, max_length=50),
    cursor: str | None = Query(default=None, max_length=512),
    size: int | None = Query(default=None, ge=1, le=100),
) -> Any:
    if principal.staff_id is None:
        raise Unauthorized("staff_authentication_required")
    return await requests_service.list_office(
        conn, status_code=status, cursor=cursor, limit=page_size(size)
    )


@router.get("/{request_id}", response_model=RequestOut)
async def get_request(
    request_id: int, conn: DbConn, principal: CurrentUser
) -> Any:
    _require_staff_permission(principal, "request.view")
    row = await requests_service.get_request(conn, request_id)
    if row is None:
        raise NotFound("request_not_found")
    return row


@router.get("/{request_id}/history", response_model=list[HistoryOut])
async def request_history(
    request_id: int, conn: DbConn, principal: CurrentUser
) -> Any:
    if not principal.is_authenticated:
        raise Unauthorized("authentication_required")
    _require_staff_permission(principal, "request.view")
    return await requests_service.get_history(conn, request_id)


@router.patch("/{request_id}/assign", response_model=RequestOut)
async def assign_request(
    request_id: int,
    conn: DbConn,
    principal: CurrentUser,
    _perm: Annotated[Principal, Depends(require_permission("request.assign"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
) -> Any:
    if principal.staff_id is None:
        raise Unauthorized("staff_authentication_required")
    return await requests_service.assign_to_self(
        conn, request_id=request_id, staff_id=principal.staff_id
    )


@router.patch("/{request_id}/status", response_model=RequestOut)
async def update_request_status(
    request_id: int,
    body: StatusUpdateIn,
    conn: DbConn,
    principal: CurrentUser,
    _perm: Annotated[Principal, Depends(require_permission("request.update_status"))],
    _mfa: Annotated[Principal, Depends(require_mfa)],
) -> Any:
    if principal.staff_id is None:
        raise Unauthorized("staff_authentication_required")
    return await requests_service.update_status(
        conn, request_id, principal.staff_id, body
    )
