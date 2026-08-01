"""Pydantic response models for the public catalogue (Structure.md §5).

Field names mirror Watiq.sql column names exactly — base_fee, never price;
governorate, never region.
"""

from __future__ import annotations

from pydantic import BaseModel


class CategoryOut(BaseModel):
    id: int
    code: str
    name: str
    name_fr: str | None
    icon: str | None
    sort_order: int


class ServiceOut(BaseModel):
    id: int
    code: str
    slug: str
    category_id: int | None
    name: str
    name_fr: str | None
    description: str | None
    description_fr: str | None
    base_fee: float | None
    currency: str
    processing_time: int | None
    is_digital: bool
    legal_reference: str | None
    office_type: str | None
    category_code: str | None
    category_name: str | None


class OfficeOut(BaseModel):
    id: int
    name: str
    name_fr: str | None
    type: str
    governorate: str
    city: str
    address: str | None
    phone: str | None
    email: str | None
    latitude: float | None
    longitude: float | None
    opening_hours: dict[str, object] | None


class OfficeServiceOut(BaseModel):
    id: int
    office_id: int
    catalog_id: int
    is_available: bool
    fee_override: float | None
    processing_time_override: int | None
    notes: str | None
    code: str
    slug: str
    name: str
    name_fr: str | None
    description: str | None
    base_fee: float | None
    currency: str
    processing_time: int | None
    is_digital: bool
