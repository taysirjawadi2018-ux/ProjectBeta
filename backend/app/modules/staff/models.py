"""SQLAlchemy Core table definitions for the staff domain.

Descriptive only — the schema, constraints and RLS policies live in Watiq.sql;
these definitions exist so repository queries are typed and column names can
never drift from the DDL (Structure.md §3, §5).
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
)

metadata = MetaData()

staff = Table(
    "staff",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("office_id", Integer, nullable=False),
    Column("role_id", Integer, nullable=False),
    Column("name", String(255), nullable=False),
    Column("email", String(255), nullable=False),
    Column("password_hash", String(255), nullable=False),
    Column("mfa_enabled", Boolean, nullable=False),
    Column("mfa_secret", String(255)),
    Column("mfa_enrolled_at", DateTime(timezone=True)),
    Column("failed_login_attempts", Integer, nullable=False),
    Column("locked_until", DateTime(timezone=True)),
    Column("last_login_at", DateTime(timezone=True)),
    Column("is_active", Boolean, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True)),
)

roles = Table(
    "roles",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(50), nullable=False),
    Column("name", String(100), nullable=False),
    Column("name_fr", String(100)),
    Column("description", String),
    Column("sort_order", Integer, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

offices = Table(
    "offices",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("name", String(255), nullable=False),
    Column("type", String(100), nullable=False),
    Column("governorate", String(100), nullable=False),
    Column("city", String(100), nullable=False),
    Column("is_active", Boolean, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

permissions = Table(
    "permissions",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(100), nullable=False),
    Column("name", String(255), nullable=False),
    Column("description", String),
)

role_permissions = Table(
    "role_permissions",
    metadata,
    Column("role_id", Integer, primary_key=True),
    Column("permission_id", Integer, primary_key=True),
    Column("granted_at", DateTime(timezone=True), nullable=False),
)
