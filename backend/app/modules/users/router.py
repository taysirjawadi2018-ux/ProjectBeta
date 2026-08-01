"""HTTP only: citizen profile endpoints (Structure.md §3)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbConn
from app.core.errors import NotFound, Unauthorized
from app.modules.users import service as users_service

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("/me")
async def me(conn: DbConn, principal: CurrentUser) -> Any:
    if principal.user_id is None:
        raise Unauthorized("authentication_required")
    profile = await users_service.get_profile(conn, principal.user_id)
    if profile is None:
        raise NotFound("user_not_found")
    return profile
