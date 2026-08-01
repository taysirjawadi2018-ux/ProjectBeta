"""SQL only (Structure.md §3). Named text() constants, never inline SQL.

The catalogue is reference data: readable by any authenticated principal
(GRANT SELECT ... TO watiq_citizen, watiq_staff in Watiq.sql §7b), so these
queries run inside the caller's RLS transaction and return plain dict rows.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_LIST_SERVICES = text(
    """
    SELECT sc.id, sc.code, sc.slug, sc.category_id, sc.name, sc.name_fr,
           sc.description, sc.description_fr, sc.base_fee, sc.currency,
           sc.processing_time, sc.is_digital, sc.legal_reference, sc.office_type,
           c.code AS category_code, c.name AS category_name
      FROM service_catalog sc
      LEFT JOIN categories c ON c.id = sc.category_id
     WHERE sc.is_active = TRUE
     ORDER BY c.sort_order NULLS LAST, sc.name
    """
)

_FIND_SERVICE_BY_SLUG = text(
    """
    SELECT sc.id, sc.code, sc.slug, sc.category_id, sc.name, sc.name_fr,
           sc.description, sc.description_fr, sc.base_fee, sc.currency,
           sc.processing_time, sc.is_digital, sc.legal_reference, sc.office_type,
           c.code AS category_code, c.name AS category_name
      FROM service_catalog sc
      LEFT JOIN categories c ON c.id = sc.category_id
     WHERE sc.slug = :slug AND sc.is_active = TRUE
    """
)

_LIST_OFFICES = text(
    """
    SELECT id, name, name_fr, type, governorate, city, address, phone, email,
           latitude, longitude, opening_hours
      FROM offices
     WHERE is_active = TRUE
       AND (:governorate IS NULL OR governorate = :governorate)
     ORDER BY governorate, name
    """
)

_LIST_OFFICE_SERVICES = text(
    """
    SELECT os.id, os.office_id, os.catalog_id, os.is_available,
           os.fee_override, os.processing_time_override, os.notes,
           sc.code, sc.slug, sc.name, sc.name_fr, sc.description,
           sc.base_fee, sc.currency, sc.processing_time, sc.is_digital
      FROM office_services os
      JOIN service_catalog sc ON sc.id = os.catalog_id
     WHERE os.office_id = :office_id
       AND os.is_available = TRUE
       AND sc.is_active = TRUE
     ORDER BY sc.name
    """
)

_LIST_CATEGORIES = text(
    """
    SELECT id, code, name, name_fr, icon, sort_order
      FROM categories
     ORDER BY sort_order, name
    """
)


async def list_services(conn: AsyncConnection) -> list[dict[str, Any]]:
    rows = await conn.execute(_LIST_SERVICES)
    return [dict(r._mapping) for r in rows.fetchall()]


async def find_service_by_slug(conn: AsyncConnection, slug: str) -> dict[str, Any] | None:
    row = (await conn.execute(_FIND_SERVICE_BY_SLUG, {"slug": slug})).first()
    return dict(row._mapping) if row else None


async def list_offices(
    conn: AsyncConnection, governorate: str | None = None,
) -> list[dict[str, Any]]:
    rows = await conn.execute(_LIST_OFFICES, {"governorate": governorate})
    return [dict(r._mapping) for r in rows.fetchall()]


async def list_office_services(
    conn: AsyncConnection, office_id: int,
) -> list[dict[str, Any]]:
    rows = await conn.execute(_LIST_OFFICE_SERVICES, {"office_id": office_id})
    return [dict(r._mapping) for r in rows.fetchall()]


async def list_categories(conn: AsyncConnection) -> list[dict[str, Any]]:
    rows = await conn.execute(_LIST_CATEGORIES)
    return [dict(r._mapping) for r in rows.fetchall()]
