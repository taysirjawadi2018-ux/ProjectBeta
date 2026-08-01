"""catalogue business rules (Structure.md §3): SQL lives in repository.py.

All catalogue reads are public reference data, so they go through cached()
(read-through, single-flight, fail-open — Backend.md §5.4). No user data ever
enters these keys. Loaders normalize Decimal -> float: orjson cannot serialize
Decimal, and the response would coerce it to float anyway, so the cached copy
and the live copy stay byte-identical.

Callers that WRITE catalogue data (service_catalog / categories / offices)
must call `bump_catalog_version()` from app.core.cache afterwards so these
keys are invalidated at the namespace level — the admin module will.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.cache import cache_key, cached
from app.modules.catalog import repository as catalog_repo

_SERVICES_TTL = 300
_OFFICES_TTL = 300


def _jsonable(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {k: float(v) if isinstance(v, Decimal) else v for k, v in row.items()}
        for row in rows
    ]


async def list_services(conn: AsyncConnection) -> list[dict[str, Any]]:
    async def _load() -> list[dict[str, Any]]:
        return _jsonable(await catalog_repo.list_services(conn))

    return await cached("catalog:services:list", _SERVICES_TTL, _load)


async def find_service_by_slug(conn: AsyncConnection, slug: str) -> dict[str, Any] | None:
    async def _load() -> dict[str, Any] | None:
        row = await catalog_repo.find_service_by_slug(conn, slug)
        if row is None:
            return None
        return _jsonable([row])[0]

    return await cached(f"catalog:services:{cache_key('svc', slug)}", _SERVICES_TTL, _load)


async def list_offices(
    conn: AsyncConnection, governorate: str | None = None,
) -> list[dict[str, Any]]:
    async def _load() -> list[dict[str, Any]]:
        return _jsonable(await catalog_repo.list_offices(conn, governorate))

    suffix = f"catalog:offices:{cache_key('governorate', governorate)}"
    return await cached(suffix, _OFFICES_TTL, _load)


async def list_office_services(
    conn: AsyncConnection, office_id: int,
) -> list[dict[str, Any]]:
    async def _load() -> list[dict[str, Any]]:
        return _jsonable(await catalog_repo.list_office_services(conn, office_id))

    suffix = f"catalog:offices:{cache_key('office_services', office_id)}"
    return await cached(suffix, _OFFICES_TTL, _load)


async def list_categories(conn: AsyncConnection) -> list[dict[str, Any]]:
    async def _load() -> list[dict[str, Any]]:
        return _jsonable(await catalog_repo.list_categories(conn))

    return await cached("catalog:categories:list", _SERVICES_TTL, _load)
