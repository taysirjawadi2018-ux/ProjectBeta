"""Pydantic request/response models (Structure.md §5 naming conventions).

Field names mirror the schema exactly — national_id, never cin.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, EmailStr, Field, field_validator

# Tunisian CIN: exactly 8 digits.
CIN_PATTERN = r"^[0-9]{8}$"
# Tunisian MSISDN in E.164.
PHONE_PATTERN = r"^\+216[0-9]{8}$"


class LoginIn(BaseModel):
    """Citizen login. `login` accepts national_id, email, or phone."""

    login: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)
    device_label: str | None = Field(default=None, max_length=255)


class StaffLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    device_label: str | None = Field(default=None, max_length=255)


class RegisterIn(BaseModel):
    national_id: str = Field(pattern=CIN_PATTERN)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, pattern=PHONE_PATTERN)
    password: str = Field(min_length=8, max_length=200)
    date_of_birth: date | None = None
    governorate: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)

    @field_validator("date_of_birth")
    @classmethod
    def not_in_future(cls, v: date | None) -> date | None:
        if v and v > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return v


class RefreshIn(BaseModel):
    """Refresh token presented via the HttpOnly cookie is read from the
    request; this body is only a placeholder for clients that cannot use
    cookies (native apps) — it is never stored client-side."""

    refresh_token: str | None = None


class OtpRequestIn(BaseModel):
    """Step-up MFA challenge for staff (purpose='login_mfa'), or resend of an
    existing verification code."""

    purpose: str = Field(pattern=r"^(login_mfa|email_verify|phone_verify|password_reset)$")


class OtpVerifyIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class PasswordResetRequestIn(BaseModel):
    login: str = Field(min_length=3, max_length=255)


class PasswordResetIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=200)


class TokenPairOut(BaseModel):
    access_token: str
    token_type: str = "Bearer"  # noqa: S105 — literal schema default, not a secret
    expires_in: int
    mfa_required: bool = False


class UserOut(BaseModel):
    id: int
    national_id: str | None
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    email_verified: bool
    phone_verified: bool
