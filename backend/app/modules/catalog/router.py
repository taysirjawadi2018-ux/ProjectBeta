"""HTTP only: public catalogue endpoints (Structure.md §3).

All reads, no auth required — the DbConn dependency resolves an anonymous
citizen principal when no token is presented, and Watiq.sql §7b grants SELECT
on the catalogue tables to watiq_citizen. Handlers return serialized dicts
(`-> Any`); the response_model does the shaping.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.core.deps import DbConn
from app.core.errors import NotFound
from app.modules.catalog import service
from app.modules.catalog.schemas import (
    CategoryOut,
    OfficeOut,
    OfficeServiceOut,
    ServiceOut,
)

router = APIRouter(prefix="/api/v1/catalog", tags=["catalog"])


@router.get("/services", response_model=list[ServiceOut])
async def list_services(conn: DbConn) -> Any:
    return await service.list_services(conn)


@router.get("/services/{slug}", response_model=ServiceOut)
async def get_service(conn: DbConn, slug: str) -> Any:
    row = await service.find_service_by_slug(conn, slug)
    if row is None:
        raise NotFound("service_not_found")
    return row


@router.get("/offices", response_model=list[OfficeOut])
async def list_offices(
    conn: DbConn, governorate: str | None = Query(default=None, max_length=100),
) -> Any:
    return await service.list_offices(conn, governorate)


@router.get("/offices/{office_id}/services", response_model=list[OfficeServiceOut])
async def list_office_services(conn: DbConn, office_id: int) -> Any:
    return await service.list_office_services(conn, office_id)


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(conn: DbConn) -> Any:
    return await service.list_categories(conn)
