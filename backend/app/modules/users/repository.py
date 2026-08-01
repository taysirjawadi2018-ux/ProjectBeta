"""users module: citizen profile (Structure.md §3, §4).

Everything here runs as the CITIZEN role through an RLS transaction — the
users_self_* policies are the real boundary; these queries just shape it.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_GET_PROFILE = text(
    """
    SELECT id, national_id, first_name, last_name, email, phone,
           email_verified, phone_verified, governorate, city,
           date_of_birth, created_at
      FROM users
     WHERE id = :user_id
    """
)

_UPDATE_PROFILE = text(
    """
    UPDATE users
       SET first_name = :first_name,
           last_name = :last_name,
           email = :email,
           phone = :phone,
           email_verified = CASE WHEN :email IS DISTINCT FROM email
                                 THEN FALSE ELSE email_verified END,
           phone_verified = CASE WHEN :phone IS DISTINCT FROM phone
                                 THEN FALSE ELSE phone_verified END
     WHERE id = :user_id
    RETURNING id, national_id, first_name, last_name, email, phone,
              email_verified, phone_verified, governorate, city, date_of_birth
    """
)


async def get_profile(conn: AsyncConnection, user_id: int) -> dict[str, Any] | None:
    row = (await conn.execute(_GET_PROFILE, {"user_id": user_id})).first()
    return dict(row) if row else None


async def update_profile(
    conn: AsyncConnection, user_id: int, **fields: Any
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            _UPDATE_PROFILE,
            {"user_id": user_id, **fields},
        )
    ).first()
    return dict(row) if row else None
