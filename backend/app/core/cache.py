"""Cache-aside read-through for PUBLIC data only (ADR-003, Backend.md §5).

Namespaced keys so bulk invalidation never needs KEYS/SCAN; single-flight lock
plus TTL jitter against stampedes. The cache FAILS OPEN: losing Redis slows the
portal down, it must not take it offline.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import random
from collections.abc import Awaitable, Callable
from typing import Any, cast

import orjson

from app.core.redis import get_redis

_NS_VERSION_KEY = "wtq:nsver:catalog"

_CACHE_MISS = object()


async def _ns_version() -> str:
    r = get_redis()
    v = await r.get(_NS_VERSION_KEY)
    if v is None:
        await r.set(_NS_VERSION_KEY, 1, nx=True)
        return "1"
    return cast(str, v.decode())


async def bump_catalog_version() -> None:
    """Call after any write to service_catalog / categories / offices."""
    await get_redis().incr(_NS_VERSION_KEY)


def cache_key(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:20]


async def cached[T](
    key_suffix: str,
    ttl: int,
    loader: Callable[[], Awaitable[T]],
    *,
    jitter: float = 0.1,
    lock_timeout: int = 5,
) -> T:
    """Cache-aside read-through, public data only (Backend.md §5.4).

    Degradation: any Redis failure falls through to `loader()`. The cache
    FAILS OPEN — losing Redis must slow the portal down, not take it offline.
    (Rate limiting and idempotency fail CLOSED — see Backend.md §5.5.)
    """
    try:
        r = get_redis()
        key = f"wtq:{await _ns_version()}:{key_suffix}"
    except Exception:
        return await loader()

    try:
        hit = await r.get(key)
        if hit is not None:
            return cast(T, orjson.loads(hit))

        lock_key = f"{key}:lock"
        got_lock = await r.set(lock_key, b"1", nx=True, ex=lock_timeout)
        if not got_lock:
            # Someone else is loading it. Wait briefly, then re-read once.
            await asyncio.sleep(0.05)
            hit = await r.get(key)
            if hit is not None:
                return cast(T, orjson.loads(hit))

        value = await loader()
        # TTL jitter smooths thundering-herd expiry; not crypto, SystemRandom
        # keeps the S311 class of scanners quiet.
        effective_ttl = int(ttl * (1 + random.SystemRandom().uniform(-jitter, jitter)))
        await r.set(key, orjson.dumps(value), ex=effective_ttl)
        if got_lock:
            await r.delete(lock_key)
        return value

    except Exception:
        return await loader()
