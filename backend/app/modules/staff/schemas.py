"""Pydantic models for the staff module (Structure.md §5).

Field names mirror Watiq.sql columns exactly; mfa_secret and password_hash
never appear — watiq_staff has no SELECT on them at any layer.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class StaffMeOut(BaseModel):
    id: int
    office_id: int
    role_id: int
    name: str
    email: EmailStr
    role_code: str
    role_name: str
    office_name: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime | None


class PermissionsOut(BaseModel):
    permissions: list[str]


class OfficeStaffOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role_name: str
    is_active: bool


class MfaEnrollOut(BaseModel):
    otpauth_uri: str
    recovery_codes: list[str]


class MfaCompleteIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)
