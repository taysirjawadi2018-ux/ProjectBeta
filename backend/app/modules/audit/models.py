"""SQLAlchemy Core table definitions for the audit domain.

Descriptive only — the schema, constraints and RLS policies live in Watiq.sql;
these definitions exist so repository queries are typed and column names can
never drift from the DDL (Structure.md §3, §5).
"""

from __future__ import annotations

from sqlalchemy import (
    BIGINT,
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

access_log = Table(
    "access_log",
    metadata,
    Column("id", BIGINT, primary_key=True),
    Column("staff_id", Integer, ForeignKey("staff.id")),
    Column("user_id", Integer, ForeignKey("users.id")),
    Column("action", String(50), nullable=False),
    Column("resource_type", String(50), nullable=False),
    Column("resource_id", Integer),
    Column("request_id", Integer, ForeignKey("requests.id")),
    Column("document_id", Integer, ForeignKey("documents.id")),
    Column("query_params", String),
    Column("ip_address", String(45)),
    Column("user_agent", String),
    Column("occurred_at", DateTime(timezone=True), nullable=False),
)

requests = Table(
    "requests",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, nullable=False),
    Column("office_service_id", Integer, nullable=False),
    Column("office_id", Integer, nullable=False),
    Column("status_id", Integer, nullable=False),
    Column("priority_id", Integer),
    Column("assigned_staff_id", Integer),
    Column("assigned_at", DateTime(timezone=True)),
    Column("form_data", String, nullable=False),
    Column("tracking_code", String(50), nullable=False),
    Column("submitted_at", DateTime(timezone=True), nullable=False),
    Column("estimated_ready_date", String),
    Column("completed_at", DateTime(timezone=True)),
    Column("notes", String),
    Column("updated_at", DateTime(timezone=True)),
)

status_history = Table(
    "status_history",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("request_id", Integer, nullable=False),
    Column("old_status_id", Integer),
    Column("new_status_id", Integer, nullable=False),
    Column("changed_by", Integer),
    Column("changed_at", DateTime(timezone=True), nullable=False),
    Column("reason", String),
)

request_statuses = Table(
    "request_statuses",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(50), nullable=False),
    Column("name", String(100), nullable=False),
    Column("name_fr", String(100)),
    Column("is_final", Boolean, nullable=False),
    Column("sort_order", Integer, nullable=False),
)
