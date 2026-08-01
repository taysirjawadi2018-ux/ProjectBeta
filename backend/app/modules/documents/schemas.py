"""Pydantic models for the documents module (Structure.md §5).

Field names mirror the schema exactly. storage_key and checksum_sha256 appear
in no output model — the key must never cross the boundary (Backend.md §9).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SHA256_PATTERN = r"^[a-f0-9]{64}$"


class DocumentPresignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_type: str = Field(min_length=1, max_length=100)
    mime_type: str = Field(max_length=100)
    file_size_bytes: int = Field(gt=0)


class PresignOut(BaseModel):
    presigned_url: str
    document_id: int


class DocumentConfirmIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    checksum_sha256: str = Field(pattern=SHA256_PATTERN)


class DocumentOut(BaseModel):
    id: int
    document_type: str
    mime_type: str | None
    file_size_bytes: int | None
    status: str
    uploaded_at: datetime | None
    verified_at: datetime | None


class VerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["verified", "rejected"]
