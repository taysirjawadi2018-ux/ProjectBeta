"""SQLAlchemy Core table definitions for the payments domain.

Descriptive only — the schema, constraints and RLS policies live in Watiq.sql;
these definitions exist so repository queries are typed and column names can
never drift from the DDL (Structure.md §3, §5).
"""

from __future__ import annotations

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
)

metadata = MetaData()

payment_types = Table(
    "payment_types",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(50), nullable=False),
    Column("name", String(255), nullable=False),
    Column("name_fr", String(255)),
)

payment_methods = Table(
    "payment_methods",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("code", String(50), nullable=False),
    Column("name", String(100), nullable=False),
    Column("name_fr", String(100)),
)

payments = Table(
    "payments",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("request_id", Integer, ForeignKey("requests.id")),
    Column("user_id", Integer, ForeignKey("users.id"), nullable=False),
    Column("type_id", Integer, ForeignKey("payment_types.id"), nullable=False),
    Column("method_id", Integer, ForeignKey("payment_methods.id")),
    Column("reference_number", String(100)),           # bank reference; masked in views
    Column("amount", Numeric(12, 3), nullable=False),
    Column("currency", String(3), nullable=False),
    Column("transaction_id", String(255)),             # gateway reference; masked in views
    Column("status", String(50), nullable=False),
    Column("paid_at", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False),
)
