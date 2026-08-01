"""SQLAlchemy Core table definitions for the users domain (descriptive only;
DDL, constraints and RLS live in Watiq.sql)."""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    Text,
)

metadata = MetaData()

users = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("national_id", String(20)),
    Column("first_name", String(100), nullable=False),
    Column("last_name", String(100), nullable=False),
    Column("email", String(255)),
    Column("phone", String(20)),
    Column("password_hash", String(255)),
    Column("date_of_birth", Date),
    Column("governorate", String(100)),
    Column("city", String(100)),
    Column("address", Text),
    Column("email_verified", Boolean, nullable=False),
    Column("phone_verified", Boolean, nullable=False),
    Column("is_active", Boolean, nullable=False),
    Column("deactivated_at", DateTime(timezone=True)),
    Column("deactivation_reason", Text),
    Column("anonymized_at", DateTime(timezone=True)),
    Column("anonymization_reason", Text),
    Column("failed_login_attempts", Integer, nullable=False),
    Column("locked_until", DateTime(timezone=True)),
    Column("last_login_at", DateTime(timezone=True)),
)
