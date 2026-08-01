"""SQLAlchemy Core table definitions for the documents domain (descriptive
only; DDL, constraints and RLS live in Watiq.sql)."""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    MetaData,
    String,
    Table,
)

metadata = MetaData()

documents = Table(
    "documents",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("request_id", Integer, ForeignKey("requests.id"), nullable=False),
    # Private object-storage key, never a URL (chk_documents_storage_key_not_url).
    Column("storage_key", String(500), nullable=False),
    Column("document_type", String(100), nullable=False),
    Column("mime_type", String(100)),
    Column("file_size_bytes", BigInteger),
    Column("checksum_sha256", String(64)),  # CHAR(64), client-supplied sha256
    Column("status", String(50), nullable=False),  # pending | verified | rejected
    Column("verified_by", Integer, ForeignKey("staff.id")),
    Column("verified_at", DateTime(timezone=True)),
    Column("uploaded_at", DateTime(timezone=True), nullable=False),
)
