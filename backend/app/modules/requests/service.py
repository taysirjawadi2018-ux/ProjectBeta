"""requests module business rules (Structure.md §3): SQL lives in repository.py.

Services are what ARQ workers call; nothing here may touch HTTP. Cross-module
calls go through other modules' service layer only, and the two lazy imports
(catalog, notifications) are deliberately inside function bodies so module
import order never matters.
"""

from __future__ import annotations

import importlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import structlog
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.errors import BadRequest, Conflict, NotFound, UnprocessableEntity
from app.core.pagination import decode_cursor, encode_cursor
from app.modules.requests import repository as requests_repo
from app.modules.requests.schemas import RequestCreateIn, StatusUpdateIn

log = structlog.get_logger("watiq.requests")

_FORMS_DIR = Path(__file__).parent / "formschemas"


async def _validate_form_data(
    conn: AsyncConnection, office_service_id: int, form_data: Any
) -> None:
    """Boundary validation of the citizen-supplied form payload.

    `requests.form_data` is JSONB with no database-enforced shape, so it is the
    one place the schema cannot help (Security.md §8.2). When the catalog
    module is available it supplies the service's form schema; otherwise we
    fall back to a plain object check rather than blocking submission.
    """
    if not isinstance(form_data, dict):
        raise UnprocessableEntity("form_data must be an object.")

    schema: dict[str, Any] | None = None
    try:
        catalog = importlib.import_module("app.modules.catalog.service")
        get_service = getattr(catalog, "get_service", None)
        if get_service is not None:
            row = await get_service(conn, office_service_id=office_service_id)
            if isinstance(row, dict):
                schema = row.get("form_schema") or row.get("required_schema")
                if schema is None and row.get("code"):
                    path = _FORMS_DIR / f"{row['code']}.json"
                    if path.is_file():
                        loaded = json.loads(path.read_text(encoding="utf-8"))
                        schema = loaded if isinstance(loaded, dict) else None
    except Exception as exc:  # catalog/formschemas are optional; never block on them
        log.warning("form_schema_unavailable", office_service_id=office_service_id,
                    error=str(exc))
        schema = None

    if schema is None:
        return
    try:
        Draft202012Validator(schema).validate(form_data)
    except ValidationError:
        raise UnprocessableEntity(
            "form_data does not match the required schema for this service."
        ) from None


async def _notify(
    conn: AsyncConnection,
    *,
    user_id: int,
    request_id: int,
    type_: str,
    title: str,
    message: str,
) -> None:
    """Insert a notifications row for the citizen.

    The notifications module may not be importable yet; the import is lazy and
    the call degrades to a warning if `notify` is absent, so this module's
    import graph never breaks.
    """
    try:
        from app.modules.notifications import service as notifications_service

        notify = getattr(notifications_service, "notify", None)
    except ImportError:
        notify = None
    if notify is None:
        log.warning("notifications_service_unavailable", request_id=request_id)
        return
    await notify(
        conn,
        user_id=user_id,
        request_id=request_id,
        type=type_,
        title=title,
        message=message,
    )


def _keyset(cursor: str | None) -> tuple[datetime | None, int]:
    """Decode an opaque cursor into (submitted_at, id) keyset bounds."""
    key = decode_cursor(cursor)
    ts: datetime | None = None
    raw = key.get("submitted_at")
    if raw:
        try:
            ts = datetime.fromisoformat(str(raw))
        except ValueError:
            ts = None
    try:
        rid = int(key.get("id") or 0)
    except (TypeError, ValueError):
        rid = 0
    return ts, rid


def _page(rows: list[dict[str, Any]], limit: int) -> dict[str, Any]:
    """Rows were fetched limit+1-deep; slice and hand back the next cursor."""
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor: str | None = None
    if has_more and items:
        last = items[-1]
        next_cursor = encode_cursor(
            submitted_at=last["submitted_at"].isoformat(), id=last["id"]
        )
    return {"items": items, "next_cursor": next_cursor}


async def create_request(
    conn: AsyncConnection, user_id: int, data: RequestCreateIn
) -> dict[str, Any]:
    """File a citizen request.

    tracking_code, status_id and office_id are derived server-side: the
    before-insert trigger allocates the code and defaults the status, and the
    composite FK to office_services pins the office (Backend.md §7.1).
    """
    await _validate_form_data(conn, data.office_service_id, data.form_data)
    row = await requests_repo.insert_request(
        conn,
        user_id=user_id,
        office_service_id=data.office_service_id,
        priority_id=data.priority_id,
        form_data=data.form_data,
    )
    request_id = int(row["id"])
    await _notify(
        conn,
        user_id=user_id,
        request_id=request_id,
        type_="status_change",
        title="Request submitted",
        message=f"Your request {row['tracking_code']} was submitted successfully.",
    )
    result = await requests_repo.get_by_id(conn, request_id)
    return result if result is not None else {}


async def list_my(
    conn: AsyncConnection,
    user_id: int,
    *,
    cursor: str | None,
    limit: int,
) -> dict[str, Any]:
    ts, rid = _keyset(cursor)
    rows = await requests_repo.list_my(
        conn, user_id=user_id, cursor_submitted_at=ts, cursor_id=rid, limit=limit + 1
    )
    return _page(rows, limit)


async def get_request(conn: AsyncConnection, request_id: int) -> dict[str, Any] | None:
    return await requests_repo.get_by_id(conn, request_id)


async def get_history(
    conn: AsyncConnection, request_id: int
) -> list[dict[str, Any]]:
    return await requests_repo.list_history(conn, request_id)


async def track_by_code(
    conn: AsyncConnection, tracking_code: str
) -> dict[str, Any] | None:
    """Public tracking lookup by code, WITHOUT authentication.

    RLS fact (Watiq.sql §7, lines 1173-1197): there is no policy allowing a
    citizen to read another citizen's request by tracking code —
    requests_owner_select is `user_id = app_current_user_id()` and
    requests_staff_office is FOR watiq_staff only. So this query runs on the
    caller's own CITIZEN connection and RLS returns exactly what that caller
    may see: an anonymous caller or a non-owner gets zero rows and therefore a
    404 here — indistinguishable from a code that does not exist. The response
    exposes status and dates only, never PII.
    """
    return await requests_repo.get_by_tracking_code(conn, tracking_code)


async def list_office_queue(
    conn: AsyncConnection, *, cursor: str | None, limit: int
) -> dict[str, Any]:
    """Unassigned requests in the caller's office; RLS requests_staff_office
    supplies the office filter."""
    ts, rid = _keyset(cursor)
    rows = await requests_repo.list_office_queue(
        conn, cursor_submitted_at=ts, cursor_id=rid, limit=limit + 1
    )
    return _page(rows, limit)


async def list_office(
    conn: AsyncConnection,
    *,
    status_code: str | None,
    cursor: str | None,
    limit: int,
) -> dict[str, Any]:
    ts, rid = _keyset(cursor)
    status_id: int | None = None
    if status_code:
        status = await requests_repo.get_status_by_code(conn, status_code)
        if status is None:
            raise BadRequest(f"unknown status code: {status_code}")
        status_id = int(status["id"])
    rows = await requests_repo.list_office(
        conn,
        status_id=status_id,
        cursor_submitted_at=ts,
        cursor_id=rid,
        limit=limit + 1,
    )
    return _page(rows, limit)


async def assign_to_self(
    conn: AsyncConnection, *, request_id: int, staff_id: int
) -> dict[str, Any]:
    """Take ownership of an unassigned request in the caller's office.

    trg_requests_sync_assignment stamps assigned_at; RLS requests_staff_office
    permits the write only for the caller's own office.
    """
    current = await requests_repo.get_by_id(conn, request_id)
    if current is None:
        raise NotFound("request_not_found")
    if current.get("assigned_staff_id") is not None:
        raise Conflict("request_already_assigned")
    updated = await requests_repo.assign_to_self(
        conn, request_id=request_id, staff_id=staff_id
    )
    if updated is None:
        raise Conflict("request_already_assigned")  # lost a race or RLS vetoed
    result = await requests_repo.get_by_id(conn, request_id)
    return result if result is not None else {}


async def update_status(
    conn: AsyncConnection,
    request_id: int,
    staff_id: int,
    data: StatusUpdateIn,
) -> dict[str, Any]:
    """Move a request through the workflow and record it in status_history.

    The new status is looked up by code; the citizen never supplies a status_id
    (they have no grant). Entering a final status stamps completed_at; the
    citizen who filed the request is notified.
    """
    current = await requests_repo.get_by_id(conn, request_id)
    if current is None:
        raise NotFound("request_not_found")

    new_status = await requests_repo.get_status_by_code(conn, data.new_status_code)
    if new_status is None:
        raise BadRequest(f"unknown status code: {data.new_status_code}")

    new_status_id = int(new_status["id"])
    is_final = bool(new_status["is_final"])
    updated = await requests_repo.update_status(
        conn,
        request_id=request_id,
        new_status_id=new_status_id,
        is_final=is_final,
    )
    if updated is None:
        raise NotFound("request_not_found")

    await requests_repo.insert_status_history(
        conn,
        request_id=request_id,
        old_status_id=current.get("status_id"),
        new_status_id=new_status_id,
        changed_by=staff_id,
        reason=data.reason,
    )
    await _notify(
        conn,
        user_id=int(current["user_id"]),
        request_id=request_id,
        type_="status_change",
        title=f"Request {current['tracking_code']} updated",
        message=f"Your request is now {new_status['name']}.",
    )
    result = await requests_repo.get_by_id(conn, request_id)
    return result if result is not None else {}
