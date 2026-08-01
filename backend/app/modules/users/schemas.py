"""Pydantic models for the users module (Structure.md §5)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.modules.auth.schemas import PHONE_PATTERN


class ProfileOut(BaseModel):
    id: int
    national_id: str | None
    first_name: str
    last_name: str
    email: EmailStr | None
    phone: str | None
    email_verified: bool
    phone_verified: bool
    governorate: str | None
    city: str | None
    date_of_birth: date | None
    created_at: datetime | None


class ProfileUpdateIn(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
