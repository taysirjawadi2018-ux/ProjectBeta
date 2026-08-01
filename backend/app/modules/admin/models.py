"""SQLAlchemy Core table definitions for the admin domain.

Descriptive only — the schema, constraints and RLS policies live in Watiq.sql;
these definitions exist so repository queries are typed and column names can
never drift from the DDL (Structure.md §3, §5).
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
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
    Column("email_verified", Boolean, nullable=False),
    Column("phone_verified", Boolean, nullable=False),
    Column("is_active", Boolean, nullable=False),
    Column("deactivated_at", DateTime(timezone=True)),
    Column("deactivation_reason", String),
    Column("anonymized_at", DateTime(timezone=True)),
    Column("anonymization_reason", String),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

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
    Column("is_active", Boolean, nullable=False),
    Column("last_login_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True)),
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

sessions = Table(
    "sessions",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id")),
    Column("staff_id", Integer, ForeignKey("staff.id")),
    Column("refresh_token_hash", String(255), nullable=False),
    Column("mfa_satisfied", Boolean, nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("revoked_at", DateTime(timezone=True)),
    Column("revoked_reason", String(100)),
)

requests = Table(
    "requests",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, nullable=False),
    Column("office_id", Integer, nullable=False),
    Column("status_id", Integer, nullable=False),
    Column("tracking_code", String(50), nullable=False),
    Column("submitted_at", DateTime(timezone=True), nullable=False),
)

documents = Table(
    "documents",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("request_id", Integer, ForeignKey("requests.id"), nullable=False),
    Column("storage_key", String(500), nullable=False),
    Column("document_type", String(100), nullable=False),
    Column("status", String(50), nullable=False),
    Column("uploaded_at", DateTime(timezone=True), nullable=False),
)
