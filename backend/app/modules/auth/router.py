"""HTTP only: paths, status codes, dependencies (Structure.md §3).

The AuthConn dependency opens the RLS transaction for watiq_auth, which has
USING (TRUE) policies — these endpoints run before a session exists.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.core.deps import AuthConn, CurrentUser, require_mfa
from app.core.errors import Forbidden, NotFound, Unauthorized
from app.core.principal import Principal
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginIn,
    OtpRequestIn,
    OtpVerifyIn,
    PasswordResetIn,
    PasswordResetRequestIn,
    RegisterIn,
    StaffLoginIn,
    TokenPairOut,
)
from app.modules.users import service as users_service

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_REFRESH_COOKIE = "__Host-wtq_rt"


def _set_refresh_cookie(response: JSONResponse, token: str) -> None:
    """__Host- prefix requires Secure and Path=/ — good, that is exactly what
    the SPA needs (Backend.md §6.2). SameSite=Strict: the refresh endpoint is
    called by fetch from the same origin, never cross-site."""
    response.set_cookie(
        _REFRESH_COOKIE,
        token,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
        max_age=14 * 24 * 3600,
    )


def _clear_refresh_cookie(response: JSONResponse) -> None:
    response.delete_cookie(_REFRESH_COOKIE, path="/")


def _token_response(pair: service.TokenPair) -> JSONResponse:
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


@router.post("/register", status_code=201)
async def register(body: RegisterIn, conn: AuthConn) -> Any:
    user_id = await service.register_citizen(conn, body)
    return await users_service.get_profile(conn, user_id)


@router.post("/login", response_model=TokenPairOut)
async def login(body: LoginIn, request: Request, conn: AuthConn) -> JSONResponse:
    pair = await service.login_citizen(
        conn, body.login, body.password,
        ip=request.client.host if request.client else "",
        ua=request.headers.get("user-agent", ""),
        device_label=body.device_label,
    )
    return _token_response(pair)


@router.post("/login/staff", response_model=TokenPairOut)
async def login_staff(body: StaffLoginIn, request: Request, conn: AuthConn) -> JSONResponse:
    pair = await service.login_staff(
        conn, body.email, body.password,
        ip=request.client.host if request.client else "",
        ua=request.headers.get("user-agent", ""),
        device_label=body.device_label,
    )
    return _token_response(pair)


@router.post("/refresh", response_model=TokenPairOut)
async def refresh(request: Request, conn: AuthConn) -> JSONResponse:
    """Rotate the refresh token from the HttpOnly cookie (ADR-005)."""
    cookie = request.cookies.get(_REFRESH_COOKIE)
    if not cookie:
        raise Unauthorized("missing_refresh_cookie")
    pair = await service.rotate_refresh(
        conn, cookie,
        ip=request.client.host if request.client else "",
        ua=request.headers.get("user-agent", ""),
    )
    return _token_response(pair)


@router.post("/logout", status_code=204)
async def logout(conn: AuthConn, principal: CurrentUser) -> JSONResponse:
    """Revoke the session server-side. The SPA also drops the in-memory access
    token; nothing of value lives in storage (ADR-005)."""
    if principal.session_id:
        await service.logout(conn, principal.session_id)
    response = JSONResponse(status_code=204, content=None)
    _clear_refresh_cookie(response)
    return response


@router.post("/otp/request", status_code=202)
async def otp_request(
    body: OtpRequestIn, request: Request, conn: AuthConn, principal: CurrentUser
) -> Any:
    """Issue a one-time code for verification or password reset."""
    await service.issue_otp(
        conn, purpose=body.purpose,
        user_id=principal.user_id, staff_id=principal.staff_id,
        channel="email", destination="principal",
        ip=request.client.host if request.client else "",
    )
    return {"status": "sent"}


@router.post("/otp/verify")
async def otp_verify(body: OtpVerifyIn, conn: AuthConn, principal: CurrentUser) -> Any:
    await service.verify_otp(
        conn, code=body.code, purpose="login_mfa",
        user_id=principal.user_id, staff_id=principal.staff_id,
    )
    return {"status": "verified"}


@router.post("/mfa/enroll")
async def mfa_enroll(conn: AuthConn, principal: CurrentUser) -> Any:
    """Generate TOTP secret + recovery codes (Backend.md §6.4)."""
    if not principal.is_staff:
        raise Forbidden("staff_only")
    if principal.staff_id is None:
        raise Unauthorized("invalid_session")
    return await service.enroll_staff_mfa(conn, principal.staff_id)


@router.post("/mfa/complete")
async def mfa_complete(
    body: OtpVerifyIn, conn: AuthConn, principal: CurrentUser
) -> JSONResponse:
    """Step-up for a partial staff session; rotates the session on success."""
    if not principal.session_id:
        raise Unauthorized("invalid_session")
    pair = await service.complete_staff_mfa(conn, principal.session_id, body.code)
    return _token_response(pair)


@router.post("/password-reset/request", status_code=202)
async def password_reset_request(
    body: PasswordResetRequestIn, request: Request, conn: AuthConn
) -> Any:
    """Always 202, always the same response: no account-existence oracle
    (Backend.md §6.5)."""
    await service.issue_otp(
        conn, purpose="password_reset", channel="email",
        destination=body.login,
        ip=request.client.host if request.client else "",
    )
    return {"status": "sent"}


@router.post("/password-reset", status_code=204)
async def password_reset(body: PasswordResetIn, conn: AuthConn) -> None:
    """Verify the reset code, then update the password on the account whose
    address the code was sent to. The verification_codes destination column
    carries the address; the code row itself carries no user link by design."""
    code_row = await service.find_code_for_reset(conn, body.code)
    await service.verify_otp(conn, code=body.code, purpose="password_reset")
    if code_row is None:
        raise NotFound("code_not_found")
    await service.reset_password_by_destination(conn, code_row["destination"],
                                                body.new_password)
    return None


@router.get("/me")
async def me(
    conn: AuthConn,
    principal: CurrentUser,
    _mfa: Annotated[Principal, Depends(require_mfa)],
) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    profile = await users_service.get_profile(conn, principal.user_id)
    if profile is None:
        raise NotFound("user_not_found")
    return profile
