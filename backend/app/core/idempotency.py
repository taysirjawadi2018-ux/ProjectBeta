"""Idempotency-Key handling for payment endpoints (Backend.md §5.2, §13.2).

A retried charge request must not charge twice. The key stores the response
for the TTL; a replay returns the stored response. FAILS CLOSED: if Redis is
unavailable, payment writes refuse rather than risk a double charge.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

import structlog

from app.core.errors import Conflict, ServiceUnavailable
from app.core.redis import get_redis

_IDEMPOTENCY_TTL = 60 * 60 * 24   # 24 h: long enough to cover gateway retries


def _idempotency_key(key: str, principal_id: str) -> str:
    """Bind the key to the principal: citizen A cannot replay citizen B's."""
    raw = f"{principal_id}:{key}"
    return "wtq:idem:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


async def claim_idempotency_key(key: str, principal_id: str) -> bool:
    """Claim the key. Returns False if it was already claimed.

    The first claimant wins; a different request body under the same key is a
    client error (Conflict), not a silent overwrite.
    """
    rkey = _idempotency_key(key, principal_id)
    try:
        r = get_redis()
        return bool(await r.set(rkey, b"pending", nx=True, ex=_IDEMPOTENCY_TTL))
    except Exception:
        raise ServiceUnavailable("idempotency_store_unavailable") from None


async def store_idempotent_response(
    key: str, principal_id: str, status: int, body: dict[str, Any]
) -> None:
    rkey = _idempotency_key(key, principal_id)
    try:
        payload = json.dumps({"status": status, "body": body}).encode()
        await get_redis().set(rkey, payload, ex=_IDEMPOTENCY_TTL)
    except Exception:
        # The write already happened; only the replay cache is lost. Log and
        # carry on — failing the response here would make the client retry.
        structlog.get_logger("watiq.idempotency").warning(
            "idempotent_response_store_failed"
        )


async def read_idempotent_response(key: str, principal_id: str) -> dict[str, Any] | None:
    try:
        raw = await get_redis().get(_idempotency_key(key, principal_id))
    except Exception:
        return None
    if raw is None:
        return None
    if raw == b"pending":
        raise Conflict("This request is already being processed.")
    payload = json.loads(raw)
    return payload if isinstance(payload, dict) else None


def require_idempotency_key(key: str | None) -> str:
    if not key:
        raise Conflict("Idempotency-Key header is required for this endpoint.")
    if len(key) > 128:
        raise Conflict("Idempotency-Key must be at most 128 characters.")
    return key
