"""staff module business rules (Structure.md §3): SQL lives in repository.py.

MFA endpoints delegate to the auth service — the AES-256-GCM secret handling
and TOTP logic live there and are never duplicated (Backend.md §6.4). They
must run on the watiq_auth engine: enroll/complete touch staff.mfa_secret and
the full sessions columns, which watiq_staff is not granted.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncConnection

from app.modules.staff import repository as staff_repo

if TYPE_CHECKING:
    from app.modules.auth.service import TokenPair


async def get_me(conn: AsyncConnection, staff_id: int) -> dict[str, Any] | None:
    return await staff_repo.get_me(conn, staff_id)


async def list_permissions(conn: AsyncConnection, staff_id: int) -> list[str]:
    return await staff_repo.list_permissions(conn, staff_id)


async def list_office_staff(conn: AsyncConnection, office_id: int) -> list[dict[str, Any]]:
    return await staff_repo.list_office_staff(conn, office_id)


async def enroll_mfa(conn: AsyncConnection, staff_id: int) -> dict[str, Any]:
    """Generate a TOTP secret + recovery codes, delegated to the auth service."""
    from app.modules.auth import service as auth_service

    return await auth_service.enroll_staff_mfa(conn, staff_id)


async def complete_mfa(conn: AsyncConnection, session_id: str, code: str) -> TokenPair:
    """Step up a partial staff session, delegated to auth's TOTP/recovery logic."""
    from app.modules.auth import service as auth_service

    return await auth_service.complete_staff_mfa(conn, session_id, code)
