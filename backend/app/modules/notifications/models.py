"""SQLAlchemy Core table definitions for the notifications domain (descriptive
only; DDL, constraints and RLS live in Watiq.sql)."""

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

notifications = Table(
    "notifications",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("request_id", Integer, ForeignKey("requests.id")),
    Column("type", String(50), nullable=False),   # 'status_change', 'appointment_reminder', ...
    Column("title", String(255), nullable=False),
    Column("message", Text, nullable=False),
    Column("is_read", Boolean, nullable=False),
    Column("sent_via", String(20), nullable=False),  # 'push' | 'email' | 'sms'
    Column("created_at", DateTime(timezone=True), nullable=False),
)
