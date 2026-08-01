"""users module business rules (Structure.md §3): SQL lives in repository.py.

Services are what ARQ workers call; nothing here may touch HTTP.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection

from app.modules.users import repository as users_repo


async def get_profile(conn: AsyncConnection, user_id: int) -> dict[str, Any] | None:
    return await users_repo.get_profile(conn, user_id)


async def update_profile(
    conn: AsyncConnection, user_id: int, **fields: Any
) -> dict[str, Any] | None:
    """Profile update. Changing email or phone re-opens verification
    (the repository flips *_verified to FALSE) — Backend.md §6.5."""
    return await users_repo.update_profile(conn, user_id, **fields)
