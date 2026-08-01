"""send_notification: write the notifications row, then dispatch (Backend.md §10).

Step 1 runs on the ADMIN engine inside an RLS transaction: RLS has no insert
policy for watiq_citizen (a citizen cannot fabricate their own notifications),
and watiq_staff's insert policy is scoped to their office's requests — the
worker must use the admin role so any citizen can be notified. Step 2 (email
via SMTP, SMS via the provider gateway) is best-effort: the row is durable
state; a delivery failure must not fail the job.
"""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage
from typing import Any

import httpx
import structlog

from app.core.config import get_settings
from app.core.db import rls_transaction
from app.core.principal import DbRole, Principal
from app.workers.tasks import JobContext, tracked

log = structlog.get_logger("watiq.workers.notifications")

_WORKER_PRINCIPAL = Principal(db_role=DbRole.ADMIN)


@tracked("send_notification")
async def send_notification(
    ctx: JobContext,
    *,
    user_id: int,
    request_id: int | None = None,
    type: str,
    title: str,
    message: str,
    sent_via: str = "push",
) -> dict[str, Any]:
    """Queue one notification for a citizen and dispatch the channel.

    Other services and the API do NOT call this directly — they enqueue it
    (arq.enqueue_job); the worker owns the admin-privileged write.
    """
    from app.modules.notifications import service as notifications_service
    from app.modules.users import service as users_service

    async with rls_transaction(_WORKER_PRINCIPAL) as conn:
        notification_id = await notifications_service.notify(
            conn,
            user_id=user_id,
            request_id=request_id,
            type=type,
            title=title,
            message=message,
            sent_via=sent_via,
        )

        profile = await users_service.get_profile(conn, user_id)

    dispatched: dict[str, bool] = {"email": False, "sms": False}
    if sent_via == "email":
        dispatched["email"] = await _dispatch_email(profile, title, message)
    elif sent_via == "sms":
        dispatched["sms"] = await _dispatch_sms(profile, message)

    return {"notification_id": notification_id, "dispatched": dispatched}


async def _dispatch_email(
    profile: dict[str, Any] | None, title: str, body: str,
) -> bool:
    s = get_settings()
    if not s.smtp_host or profile is None or not profile.get("email"):
        log.info("email_dispatch_skipped", reason="not_configured")
        return False
    msg = EmailMessage()
    msg["Subject"] = title
    msg["From"] = s.smtp_from
    msg["To"] = profile["email"]
    msg.set_content(body)

    def _send() -> None:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10) as server:  # type: ignore[arg-type]
            server.starttls()
            if s.smtp_user and s.smtp_password:
                server.login(s.smtp_user, s.smtp_password.get_secret_value())
            server.send_message(msg)

    try:
        await asyncio.to_thread(_send)
        return True
    except OSError as exc:
        log.warning("email_dispatch_failed", error=str(exc))
        return False


async def _dispatch_sms(profile: dict[str, Any] | None, body: str) -> bool:
    s = get_settings()
    if not s.sms_gateway_endpoint or not s.sms_provider_key:
        log.info("sms_dispatch_skipped", reason="not_configured")
        return False
    if profile is None or not profile.get("phone"):
        log.info("sms_dispatch_skipped", reason="no_phone")
        return False
    try:
        async with httpx.AsyncClient(timeout=s.payment_gateway_timeout_seconds) as client:
            resp = await client.post(
                s.sms_gateway_endpoint,
                json={"to": profile["phone"], "from": s.sms_from, "text": body},
                headers={"Authorization": f"Bearer {s.sms_provider_key.get_secret_value()}"},
            )
            resp.raise_for_status()
            return True
    except httpx.HTTPError as exc:
        log.warning("sms_dispatch_failed", error=str(exc))
        return False
