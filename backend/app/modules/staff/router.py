"""HTTP only: staff self-service endpoints (Structure.md §3)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.deps import AuthConn, CurrentUser, DbConn
from app.core.errors import NotFound, Unauthorized
from app.modules.staff import service
from app.modules.staff.schemas import (
    MfaCompleteIn,
    MfaEnrollOut,
    PermissionsOut,
    StaffMeOut,
)

router = APIRouter(prefix="/api/v1/staff", tags=["staff"])

_REFRESH_COOKIE = "__Host-wtq_rt"


def _set_refresh_cookie(response: JSONResponse, token: str) -> None:
    """Mirror of auth.router._set_refresh_cookie: step-up must hand back the
    exact cookie contract the SPA already reads (Backend.md §6.2)."""
    response.set_cookie(
        _REFRESH_COOKIE,
        token,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
        max_age=14 * 24 * 3600,
    )


@router.get("/me", response_model=StaffMeOut)
async def me(conn: DbConn, principal: CurrentUser) -> Any:
    """Own staff profile: staff row + role code + office name, joined. RLS
    staff_same_office scopes the row; the watiq_staff GRANT already excludes
    password_hash and mfa_secret."""
    if principal.staff_id is None:
        raise Unauthorized("authentication_required")
    profile = await service.get_me(conn, principal.staff_id)
    if profile is None:
        raise NotFound("staff_not_found")
    return profile


@router.get("/me/permissions", response_model=PermissionsOut)
async def me_permissions(conn: DbConn, principal: CurrentUser) -> Any:
    """Own permission codes (roles -> role_permissions -> permissions); the
    SPA renders the UI from this list."""
    if principal.staff_id is None:
        raise Unauthorized("authentication_required")
    permissions = await service.list_permissions(conn, principal.staff_id)
    return {"permissions": permissions}


@router.get("/office")
async def office_directory(conn: DbConn, principal: CurrentUser) -> Any:
    """Same-office staff directory. RLS staff_same_office is the boundary;
    the GRANT keeps password_hash and mfa_secret out of the projection."""
    if principal.staff_id is None:
        raise Unauthorized("authentication_required")
    if principal.office_id is None:
        raise Unauthorized("invalid_session")
    members = await service.list_office_staff(conn, principal.office_id)
    return {"staff": members}


@router.post("/me/mfa/enroll", response_model=MfaEnrollOut)
async def mfa_enroll(conn: AuthConn, principal: CurrentUser) -> Any:
    """TOTP enrollment, delegated to auth's crypto (Backend.md §6.4). Runs on
    the auth engine: enrolling writes staff.mfa_secret, which watiq_staff
    cannot update."""
    if principal.staff_id is None:
        raise Unauthorized("invalid_session")
    return await service.enroll_mfa(conn, principal.staff_id)


@router.post("/me/mfa/complete")
async def mfa_complete(
    body: MfaCompleteIn, conn: AuthConn, principal: CurrentUser
) -> JSONResponse:
    """Step-up for a partial session, delegated to auth service. Returns a
    fresh token pair and rotates the refresh token, exactly like auth's."""
    if principal.session_id is None:
        raise Unauthorized("invalid_session")
    pair = await service.complete_mfa(conn, principal.session_id, body.code)
    response = JSONResponse(
        content={
            "access_token": pair.access,
            "token_type": "Bearer",
            "expires_in": 900,
            "mfa_required": pair.mfa_required,
        }
    )
    _set_refresh_cookie(response, pair.refresh)
    return response
