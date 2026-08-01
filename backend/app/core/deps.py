"""FastAPI dependencies: DbConn, CurrentUser, require_permission and the
role-specialized connections (auth / admin / auditor).

Backend.md §4.3. `require_permission` mirrors fn_staff_has_permission(), which
RLS also calls — Layer 2 gives a clean 403 instead of an opaque empty result
set, and Layer 4 holds if Layer 2 is ever forgotten.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import replace
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.db import rls_transaction
from app.core.errors import Forbidden, Unauthorized
from app.core.principal import DbRole, Principal
from app.core.security import decode_access_token


def principal_from_token(token: str) -> Principal:
    claims = decode_access_token(token)
    typ = claims.get("typ")
    if typ == "citizen":
        return Principal(
            db_role=DbRole.CITIZEN,
            user_id=claims.get("sub"),
            session_id=claims.get("sid"),
            mfa_satisfied=bool(claims.get("mfa", False)),
        )
    if typ == "staff":
        role_code = claims.get("role")
        perms = frozenset(claims.get("perms") or ())
        # national_auditor and admin are their own DB roles (ADR-001); a
        # director keeps the STAFF role for office-scoped work and reaches
        # privileged operations via the admin module's own connection.
        db_role = DbRole.AUDITOR if role_code == "national_auditor" else (
            DbRole.ADMIN if role_code == "admin" else DbRole.STAFF
        )
        return Principal(
            db_role=db_role,
            staff_id=claims.get("sub"),
            office_id=claims.get("office"),
            role_code=role_code,
            permissions=perms,
            session_id=claims.get("sid"),
            mfa_satisfied=bool(claims.get("mfa", False)),
        )
    raise Unauthorized("invalid_token_claims")


async def current_principal(request: Request) -> Principal:
    """Decode the access JWT into a Principal. Raises 401 if absent/invalid."""
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return Principal(db_role=DbRole.CITIZEN)  # anonymous, per Backend.md §4.4
    return principal_from_token(token)


async def db(
    principal: Annotated[Principal, Depends(current_principal)],
) -> AsyncIterator[AsyncConnection]:
    async with rls_transaction(principal) as conn:
        yield conn


async def auth_db() -> AsyncIterator[AsyncConnection]:
    """watiq_auth engine: login/register/refresh/OTP before a session exists.

    The auth-service policies are USING (TRUE); no identity GUCs are needed.
    """
    async with rls_transaction(Principal(db_role=DbRole.AUTH)) as conn:
        yield conn


async def admin_db(
    principal: Annotated[Principal, Depends(current_principal)],
) -> AsyncIterator[AsyncConnection]:
    """watiq_admin engine for back-office operations (erasure, staff, roles).

    Identity GUCs are still set so access_log rows carry the actor.
    """
    async with rls_transaction(replace(principal, db_role=DbRole.ADMIN)) as conn:
        yield conn


async def auditor_db() -> AsyncIterator[AsyncConnection]:
    """watiq_auditor engine for read-only cross-office work (tracking lookup)."""
    async with rls_transaction(Principal(db_role=DbRole.AUDITOR)) as conn:
        yield conn


def require_permission(code: str) -> Any:
    """Layer-2 authorization. Layers 3 and 4 (GRANT + RLS) still apply below."""
    async def _check(
        principal: Annotated[Principal, Depends(current_principal)],
    ) -> Principal:
        if code not in principal.permissions:
            raise Forbidden(f"missing permission: {code}")
        return principal
    return _check


def require_mfa(
    principal: Annotated[Principal, Depends(current_principal)],
) -> Principal:
    """Endpoints touching citizen PII require staff MFA (Backend.md §6.4)."""
    if principal.is_authenticated and not principal.mfa_satisfied:
        raise Forbidden("mfa_required")
    return principal


DbConn = Annotated[AsyncConnection, Depends(db)]
AuthConn = Annotated[AsyncConnection, Depends(auth_db)]
AdminConn = Annotated[AsyncConnection, Depends(admin_db)]
AuditorConn = Annotated[AsyncConnection, Depends(auditor_db)]
CurrentUser = Annotated[Principal, Depends(current_principal)]
