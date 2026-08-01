"""Application-aware rate limiting — sliding window, FAILS CLOSED.

Nginx and CrowdSec apply coarser limits earlier (Security.md §3-4); these are
the application-aware ones from Backend.md §5.6. If Redis is unreachable, the
write endpoints must refuse (503), not hand an attacker unlimited attempts the
moment they can disrupt Redis.
"""

from __future__ import annotations

import time
from typing import Protocol

from app.core.errors import RateLimited, ServiceUnavailable
from app.core.redis import get_redis


class Clock(Protocol):
    def monotonic(self) -> float: ...


class _DefaultClock:
    def monotonic(self) -> float:
        return time.monotonic()


def _clock() -> Clock:
    return _DefaultClock()


async def check_rate_limit(
    scope: str,
    key: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Sliding-window counter. Raises RateLimited when the budget is spent.

    The window is stored as a sorted set of timestamps; entries older than the
    window are pruned on every call, keeping the set bounded.
    """
    now = _clock().monotonic()
    rkey = f"wtq:rl:{scope}:{key}"

    try:
        r = get_redis()
        pipe = r.pipeline(transaction=True)
        pipe.zremrangebyscore(rkey, 0, now - window_seconds)
        pipe.zadd(rkey, {str(now): now})
        pipe.zcard(rkey)
        pipe.expire(rkey, window_seconds * 2)
        results = await pipe.execute()
        count = results[2]
    except Exception:
        # FAIL CLOSED: a rate limiter that cannot count must not be bypassed.
        raise ServiceUnavailable("rate_limiter_unavailable") from None

    if count > limit:
        oldest = (await r.zrange(rkey, 0, 0))[0] if count > 0 else str(now)
        retry_after = max(1, int(window_seconds - (now - float(oldest))))
        raise RateLimited("Too many requests.", retry_after_seconds=retry_after)
