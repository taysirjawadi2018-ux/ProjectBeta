"""SQLAlchemy Core table definitions for the requests domain.

Descriptive only — the schema, constraints and RLS policies live in Watiq.sql;
these definitions exist so repository queries are typed and column names can
never drift from the DDL (Structure.md §3, §5).
"""

from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

priorities = Table(
    "priorities",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(50), nullable=False),
    Column("name", String(100), nullable=False),
    Column("name_fr", String(100)),
    Column("sort_order", Integer),
)

request_statuses = Table(
    "request_statuses",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(50), nullable=False),
    Column("name", String(100), nullable=False),
    Column("name_fr", String(100)),
    Column("color", String(7)),
    Column("sort_order", Integer),
    Column("is_final", Boolean, nullable=False),
)

requests = Table(
    "requests",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("office_service_id", Integer, nullable=False),
    Column("office_id", Integer, nullable=False),
    Column("status_id", Integer, ForeignKey("request_statuses.id"), nullable=False),
    Column("priority_id", Integer, ForeignKey("priorities.id")),
    Column("assigned_staff_id", Integer, ForeignKey("staff.id")),
    Column("assigned_at", DateTime(timezone=True)),
    Column("form_data", JSONB, nullable=False),     # dynamic form responses (PII)
    Column("tracking_code", String(50), nullable=False),  # set by trg_requests_before_insert
    Column("submitted_at", DateTime(timezone=True), nullable=False),
    Column("estimated_ready_date", Date),
    Column("completed_at", DateTime(timezone=True)),
    Column("notes", Text),
    Column("updated_at", DateTime(timezone=True)),
)

status_history = Table(
    "status_history",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("request_id", Integer, ForeignKey("requests.id"), nullable=False),
    Column("old_status_id", Integer, ForeignKey("request_statuses.id")),
    Column("new_status_id", Integer, ForeignKey("request_statuses.id"), nullable=False),
    Column("changed_by", Integer, ForeignKey("staff.id")),
    Column("changed_at", DateTime(timezone=True), nullable=False),
    Column("reason", Text),
)
