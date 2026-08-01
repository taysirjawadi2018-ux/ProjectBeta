"""Pydantic models for the admin module (Structure.md §5).

Field names mirror Watiq.sql columns exactly.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class AdminUserSearchOut(BaseModel):
    id: int
    national_id: str | None
    first_name: str | None
    last_name: str | None
    email: str | None
    phone: str | None
    is_active: bool
    deactivated_at: datetime | None
    deactivation_reason: str | None
    anonymized_at: datetime | None
    created_at: datetime | None


class AdminUserPageOut(BaseModel):
    items: list[AdminUserSearchOut]
    next_cursor: str | None


class DeactivateIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class AnonymizeIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class StaffCreateIn(BaseModel):
    office_id: int
    role_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class StaffOut(BaseModel):
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


class RoleOut(BaseModel):
    id: int
    code: str
    name: str


class PermissionOut(BaseModel):
    id: int
    code: str
    name: str


class PermissionsUpdateIn(BaseModel):
    permission_codes: list[str]
