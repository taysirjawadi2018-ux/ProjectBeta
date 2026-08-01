"""SQL only (Structure.md §3). The audit module owns access_log.

Other modules write audit rows through this repository — but on their OWN
engines: watiq_staff and watiq_citizen hold INSERT on access_log with RLS
pinning the actor to the session GUCs (access_log_insert_staff/citizen), and
neither has SELECT. The INSERT therefore deliberately has NO RETURNING
(Backend.md §7.3, Watiq.sql line ~1361). occurred_at is trigger/default-owned
(DEFAULT CURRENT_TIMESTAMP, Watiq.sql line 1021) and is never supplied here.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_INSERT_ACCESS_LOG = text(
    """
    INSERT INTO access_log (staff_id, user_id, action, resource_type,
                            resource_id, request_id, document_id,
                            query_params, ip_address, user_agent)
    VALUES (:staff_id, :user_id, :action, :resource_type,
            :resource_id, :request_id, :document_id,
            CAST(:query_params AS jsonb), CAST(:ip AS inet), :ua)
    """
)  # no RETURNING: watiq_staff/watiq_citizen have INSERT but not SELECT

_LIST_ACCESS_LOG = text(
    """
    SELECT id, staff_id, user_id, action, resource_type, resource_id,
           request_id, document_id, query_params, ip_address, user_agent,
           occurred_at
      FROM access_log
     WHERE (CAST(:user_id AS int) IS NULL OR user_id = :user_id)
       AND (CAST(:staff_id AS int) IS NULL OR staff_id = :staff_id)
       AND (CAST(:resource_type AS text) IS NULL OR resource_type = :resource_type)
       AND (CAST(:from_ AS timestamptz) IS NULL OR occurred_at >= :from_)
       AND (CAST(:to AS timestamptz) IS NULL OR occurred_at <= :to)
       AND (CAST(:cursor_occ AS timestamptz) IS NULL OR
            (occurred_at, id) < (CAST(:cursor_occ AS timestamptz),
                                 CAST(:cursor_id AS bigint)))
     ORDER BY occurred_at DESC, id DESC
     LIMIT :limit
    """
)

_LIST_ACCESS_LOG_BY_USER = text(
    """
    SELECT id, staff_id, user_id, action, resource_type, resource_id,
           request_id, document_id, query_params, ip_address, user_agent,
           occurred_at
      FROM access_log
     WHERE user_id = :user_id
     ORDER BY occurred_at DESC, id DESC
    """
)

_LIST_ACCESS_LOG_BY_STAFF = text(
    """
    SELECT id, staff_id, user_id, action, resource_type, resource_id,
           request_id, document_id, query_params, ip_address, user_agent,
           occurred_at
      FROM access_log
     WHERE staff_id = :staff_id
     ORDER BY occurred_at DESC, id DESC
    """
)

_LIST_USER_REQUESTS = text(
    """
    SELECT r.id, r.tracking_code, r.office_id, r.status_id,
           rs.code AS status_code, r.submitted_at, r.estimated_ready_date,
           r.completed_at, r.form_data, r.notes
      FROM requests r
      JOIN request_statuses rs ON rs.id = r.status_id
     WHERE r.user_id = :user_id
     ORDER BY r.id DESC
    """
)

_LIST_USER_STATUS_HISTORY = text(
    """
    SELECT sh.id, sh.request_id, sh.old_status_id, sh.new_status_id,
           os.code AS old_status_code, ns.code AS new_status_code,
           sh.changed_by, sh.changed_at, sh.reason
      FROM status_history sh
      JOIN request_statuses ns ON ns.id = sh.new_status_id
      LEFT JOIN request_statuses os ON os.id = sh.old_status_id
     WHERE EXISTS (SELECT 1 FROM requests r
                    WHERE r.id = sh.request_id AND r.user_id = :user_id)
     ORDER BY sh.changed_at DESC
    """
)


def _normalize(d: dict[str, Any]) -> dict[str, Any]:
    """SQLAlchemy's asyncpg codecs return jsonb as parsed objects and inet as
    str; this guards the inet edge case so schemas can type it as str."""
    ip = d.get("ip_address")
    d["ip_address"] = str(ip) if ip is not None else None
    return d


async def insert_access_log(
    conn: AsyncConnection,
    *,
    staff_id: int | None,
    user_id: int | None,
    action: str,
    resource_type: str,
    resource_id: int | None,
    request_id: int | None,
    document_id: int | None,
    query_params: dict[str, Any] | None,
    ip: str | None,
    user_agent: str | None,
) -> None:
    await conn.execute(
        _INSERT_ACCESS_LOG,
        {
            "staff_id": staff_id,
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "request_id": request_id,
            "document_id": document_id,
            "query_params": query_params,
            "ip": ip,
            "ua": user_agent,
        },
    )


async def list_access_log(
    conn: AsyncConnection,
    *,
    user_id: int | None,
    staff_id: int | None,
    resource_type: str | None,
    from_: datetime | None,
    to: datetime | None,
    cursor_occurred_at: datetime | None,
    cursor_id: int | None,
    limit: int,
) -> list[dict[str, Any]]:
    rows = (
        await conn.execute(
            _LIST_ACCESS_LOG,
            {
                "user_id": user_id,
                "staff_id": staff_id,
                "resource_type": resource_type,
                "from_": from_,
                "to": to,
                "cursor_occ": cursor_occurred_at,
                "cursor_id": cursor_id,
                "limit": limit,
            },
        )
    ).all()
    return [_normalize(dict(r)) for r in rows]


async def list_user_access_log(conn: AsyncConnection, user_id: int) -> list[dict[str, Any]]:
    rows = (await conn.execute(_LIST_ACCESS_LOG_BY_USER, {"user_id": user_id})).all()
    return [_normalize(dict(r)) for r in rows]


async def list_staff_access_log(conn: AsyncConnection, staff_id: int) -> list[dict[str, Any]]:
    rows = (await conn.execute(_LIST_ACCESS_LOG_BY_STAFF, {"staff_id": staff_id})).all()
    return [_normalize(dict(r)) for r in rows]


async def list_user_requests(conn: AsyncConnection, user_id: int) -> list[dict[str, Any]]:
    rows = (await conn.execute(_LIST_USER_REQUESTS, {"user_id": user_id})).all()
    return [dict(r) for r in rows]


async def list_user_status_history(conn: AsyncConnection, user_id: int) -> list[dict[str, Any]]:
    rows = (await conn.execute(_LIST_USER_STATUS_HISTORY, {"user_id": user_id})).all()
    return [dict(r) for r in rows]
