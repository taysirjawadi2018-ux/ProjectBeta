"""Redis client factory. One dependency serving cache, rate limits,
idempotency keys, locks, and the ARQ job queues (Backend.md §5).
"""

from __future__ import annotations

from redis.asyncio import Redis

from app.core.config import get_settings

_client: Redis | None = None


def get_redis() -> Redis:
    """A single shared client. Connection errors surface at call time; the
    cache layer fails open and the rate limiter fails closed around it."""
    global _client
    if _client is None:
        s = get_settings()
        _client = Redis.from_url(
            str(s.redis_dsn),
            max_connections=s.redis_max_connections,
            socket_connect_timeout=1,
            socket_timeout=2,
            decode_responses=False,
        )
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
