"""SQLAlchemy Core table definitions for the public catalogue (descriptive only;
DDL, constraints and RLS live in Watiq.sql)."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

categories = Table(
    "categories",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(50), nullable=False),
    Column("name", String(255), nullable=False),
    Column("name_fr", String(255)),                 # French localization
    Column("icon", String(255)),                    # icon URL or class name
    Column("sort_order", Integer, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

offices = Table(
    "offices",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String(255), nullable=False),
    Column("name_fr", String(255)),
    Column("type", String(100), nullable=False),    # 'municipality', 'tax_office', ...
    Column("governorate", String(100), nullable=False),
    Column("city", String(100), nullable=False),
    Column("address", Text),
    Column("phone", String(20)),
    Column("email", String(255)),
    Column("latitude", Numeric(10, 8)),
    Column("longitude", Numeric(11, 8)),
    Column("opening_hours", JSONB),                 # flexible schedule storage
    Column("is_active", Boolean, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True)),
)

service_catalog = Table(
    "service_catalog",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(100), nullable=False),    # stable machine key
    Column("slug", String(255), nullable=False),    # clean national URL
    Column("category_id", Integer, ForeignKey("categories.id")),
    Column("name", String(255), nullable=False),
    Column("name_fr", String(255)),
    Column("description", Text),
    Column("description_fr", Text),
    Column("required_documents", JSONB),            # national legal requirement
    Column("base_fee", Numeric(12, 3)),             # statutory fee; NULL = free
    Column("currency", String(3), nullable=False),
    Column("processing_time", Integer),             # national SLA, in days
    Column("is_digital", Boolean, nullable=False),
    Column("legal_reference", Text),
    Column("office_type", String(100)),
    Column("is_active", Boolean, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True)),
)

office_services = Table(
    "office_services",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("office_id", Integer, ForeignKey("offices.id"), nullable=False),
    Column("catalog_id", Integer, ForeignKey("service_catalog.id"), nullable=False),
    Column("is_available", Boolean, nullable=False),
    Column("processing_time_override", Integer),
    Column("fee_override", Numeric(12, 3)),
    Column("notes", Text),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True)),
)
