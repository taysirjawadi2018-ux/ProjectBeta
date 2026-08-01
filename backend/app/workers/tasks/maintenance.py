"""Maintenance jobs (Backend.md §10).

All of them run on the watiq_admin engine inside an RLS transaction — the
admin role's FOR ALL policies are what make cross-citizen operations legal,
and the explicit Principal keeps the RLS contract visible in the job code.

Idempotency: every job here either calls a schema function the DB makes
idempotent (fn_purge_expired_auth_artifacts), is a pure state-machine
transition guarded by WHERE (expire_no_show_appointments), warms cache keys
(cache PUTs are naturally idempotent), or loops with per-item state-machine
guards (reconcile_payments: pending -> completed/failed only).
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog
from sqlalchemy import text

from app.core import cache
from app.core.config import get_settings
from app.core.db import rls_transaction
from app.core.principal import DbRole, Principal
from app.workers.tasks import JobContext, tracked

log = structlog.get_logger("watiq.workers.maintenance")

_WORKER_PRINCIPAL = Principal(db_role=DbRole.ADMIN)

_PURGE_FN = text("SELECT fn_purge_expired_auth_artifacts()")

_EXPIRE_NO_SHOWS = text(
    """
    UPDATE appointments a
       SET status = 'no_show'
      FROM appointment_slots s
     WHERE a.slot_id = s.id
       AND a.status = 'scheduled'
       AND s.slot_date < CURRENT_DATE
    """
)


@tracked("purge_expired_auth_artifacts")
async def purge_expired_auth_artifacts(ctx: JobContext) -> dict[str, Any]:
    """Daily 03:00. Delegates to the schema's own function (Watiq.sql §8):
    sessions/verification codes past their grace windows are deleted."""
    async with rls_transaction(_WORKER_PRINCIPAL) as conn:
        await conn.execute(_PURGE_FN)
    log.info("purge_expired_auth_artifacts_done")
    return {"ok": True}


@tracked("expire_no_show_appointments")
async def expire_no_show_appointments(ctx: JobContext) -> dict[str, Any]:
    """Hourly. scheduled + past slot date -> no_show; the AFTER trigger on
    appointments releases the slot capacity (fn_sync_slot_booked_count)."""
    async with rls_transaction(_WORKER_PRINCIPAL) as conn:
        result = await conn.execute(_EXPIRE_NO_SHOWS)
        affected = result.rowcount
    log.info("expired_no_shows", count=affected)
    return {"no_shows": affected}


@tracked("refresh_catalog_cache")
async def refresh_catalog_cache(ctx: JobContext) -> dict[str, Any]:
    """Hourly. Warms every catalogue key so the first citizen of the day is
    not the one who pays for the miss (Backend.md §10). Public data only,
    under the CITIZEN role — exactly the role the API would use."""
    from app.modules.catalog import repository as catalog_repo
    from app.modules.catalog import service as catalog_service

    principal = Principal(db_role=DbRole.CITIZEN)
    warmed: dict[str, int] = {}
    async with rls_transaction(principal) as conn:
        offices = await catalog_repo.list_offices(conn, None)
        warmed["services"] = len(await catalog_service.list_services(conn))
        warmed["categories"] = len(await catalog_service.list_categories(conn))
        warmed["offices"] = len(await catalog_service.list_offices(conn))
        governorates = sorted({o["governorate"] for o in offices})
        for g in governorates:
            warmed[g] = len(await catalog_service.list_offices(conn, g))
        for office in offices:
            warmed["office_services"] = warmed.get("office_services", 0) + len(
                await catalog_service.list_office_services(conn, office["id"])
            )
    # Version bump keeps pre-warm keys from serving stale data forever if a
    # write happened between the last bump and this run.
    await cache.bump_catalog_version()
    log.info("catalog_cache_refreshed", keys=len(warmed))
    return {"keys": len(warmed)}


@tracked("reconcile_payments")
async def reconcile_payments(ctx: JobContext) -> dict[str, Any]:
    """Every 15 min. Compares pending payments against the gateway
    (Backend.md §10, Security.md §8.4). Creation and confirmation of payment
    records live here — citizens hold no INSERT on payments (Watiq.sql
    line 1418), and this job is their only writer besides the confirm step.

    Without a configured gateway (dev), the job is a no-op: payments stay
    pending and the circuit is open, by design.
    """
    s = get_settings()
    if not s.payment_gateway_endpoint:
        log.info("reconcile_payments_skipped", reason="gateway_not_configured")
        return {"reconciled": 0, "skipped": "gateway_not_configured"}

    from app.modules.payments import repository as payments_repo
    from app.modules.payments import service as payments_service
    from app.modules.payments.schemas import PaymentConfirmIn

    reconciled = {"completed": 0, "failed": 0}
    async with rls_transaction(_WORKER_PRINCIPAL) as conn:
        pending = await payments_repo.list_pending(conn, limit=500)
        for payment in pending:
            outcome = await _gateway_check(payment)
            if outcome is None:
                # Gateway unreachable: leave pending, retry next run.
                break
            if outcome["status"] == "completed":
                await payments_service.confirm(
                    conn,
                    payment["id"],
                    PaymentConfirmIn(transaction_id=outcome.get("transaction_id")),
                )
                reconciled["completed"] += 1
            else:
                await payments_repo.mark_failed(
                    conn, payment_id=payment["id"], reference_number=None,
                )
                reconciled["failed"] += 1
    log.info("reconcile_payments_done", **reconciled)
    return reconciled


async def _gateway_check(payment: dict[str, Any]) -> dict[str, Any] | None:
    """Ask the gateway about one pending payment. None = unreachable."""
    s = get_settings()
    endpoint = s.payment_gateway_endpoint
    if endpoint is None:
        return None
    try:
        async with httpx.AsyncClient(timeout=s.payment_gateway_timeout_seconds) as client:
            resp = await client.post(
                f"{endpoint.rstrip('/')}/payments/{payment['id']}/status",
                json={"amount": str(payment["amount"]), "currency": payment["currency"]},
                headers={
                    "Authorization": f"Bearer {s.payment_gateway_secret.get_secret_value()}"
                    if s.payment_gateway_secret else "Bearer unset",
                },
            )
            resp.raise_for_status()
            return dict(resp.json())
    except httpx.HTTPError:
        log.warning("gateway_unreachable", payment_id=payment["id"])
        return None
