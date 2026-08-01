"""SQLAlchemy Core table definitions for the auth domain.

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
    Text,
)

metadata = MetaData()

sessions = Table(
    "sessions",
    metadata,
    Column("id", String(36), primary_key=True),       # gen_random_uuid() in DDL
    Column("user_id", Integer, ForeignKey("users.id")),
    Column("staff_id", Integer, ForeignKey("staff.id")),
    Column("refresh_token_hash", String(255), nullable=False),
    Column("device_label", String(255)),
    Column("ip_address", String(45)),                 # INET
    Column("user_agent", Text),
    Column("mfa_satisfied", Boolean, nullable=False),
    Column("issued_at", DateTime(timezone=True), nullable=False),
    Column("last_seen_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("revoked_at", DateTime(timezone=True)),
    Column("revoked_reason", String(100)),
)

verification_codes = Table(
    "verification_codes",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id")),
    Column("staff_id", Integer, ForeignKey("staff.id")),
    Column("purpose", String(50), nullable=False),
    Column("channel", String(20), nullable=False),
    Column("destination", String(255), nullable=False),
    Column("code_hash", String(255), nullable=False),
    Column("attempt_count", Integer, nullable=False),
    Column("max_attempts", Integer, nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("consumed_at", DateTime(timezone=True)),
    Column("ip_address", String(45)),
    Column("created_at", DateTime(timezone=True), nullable=False),
)

staff_recovery_codes = Table(
    "staff_recovery_codes",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("staff_id", Integer, ForeignKey("staff.id"), nullable=False),
    Column("code_hash", String(255), nullable=False),
    Column("used_at", DateTime(timezone=True)),
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
    Column("mfa_enrolled_at", DateTime(timezone=True)),
    Column("failed_login_attempts", Integer, nullable=False),
    Column("locked_until", DateTime(timezone=True)),
    Column("last_login_at", DateTime(timezone=True)),
    Column("is_active", Boolean, nullable=False),
)

roles = Table(
    "roles",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(50), nullable=False),
)
