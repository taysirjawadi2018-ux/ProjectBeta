"""SQLAlchemy Core table definitions for the appointments domain.

Descriptive only — the schema, constraints, triggers and RLS policies live in
Watiq.sql; these definitions exist so repository queries are typed and column
names can never drift from the DDL (Structure.md §3, §5).
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

metadata = MetaData()

appointment_slots = Table(
    "appointment_slots",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("office_id", Integer, ForeignKey("offices.id"), nullable=False),
    Column("office_service_id", Integer, ForeignKey("office_services.id")),
    Column("slot_date", Date, nullable=False),
    Column("time_slot", String(20), nullable=False),       # e.g. '09:00-10:00'
    Column("capacity", Integer, nullable=False),
    Column("booked_count", Integer, nullable=False),       # trigger-maintained, read-only
    Column("is_active", Boolean, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True)),
)

appointments = Table(
    "appointments",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("slot_id", Integer, ForeignKey("appointment_slots.id"), nullable=False),
    Column("request_id", Integer, ForeignKey("requests.id")),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("office_id", Integer, ForeignKey("offices.id"), nullable=False),  # trigger-derived
    Column("office_service_id", Integer, ForeignKey("office_services.id"), nullable=False),
    Column("status", String(50), nullable=False),
    Column("queue_number", String(20)),                    # physical queue ticket
    Column("reason", Text),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
