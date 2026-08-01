"""Exception types and the constraint-error map.

Every error the API raises is an :class:`AppError` subclass carrying a stable
``code`` string and an RFC 9457 problem+json shape. The constraint map in
Backend.md §8 translates database constraint violations into stable, non-leaky
API errors — and the two 500 entries are deliberate: they are OUR bugs and must
page, not be user-facing.
"""

from __future__ import annotations

from typing import Any

from asyncpg.exceptions import (
    CheckViolationError,
    ForeignKeyViolationError,
    InsufficientPrivilegeError,
    UniqueViolationError,
)


class AppError(Exception):
    """Base class for all client-facing errors."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str = "An internal error occurred.", **details: Any) -> None:
        super().__init__(message)
        self.message = message
        self.details = details

    def as_problem(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "type": "about:blank",
            "title": self.code,
            "status": self.status_code,
            "detail": self.message,
        }
        body.update(self.details)
        return body


class BadRequest(AppError):
    status_code = 400
    code = "bad_request"


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"

    def __init__(self, message: str = "Authentication required.") -> None:
        super().__init__(message)


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class UnprocessableEntity(AppError):
    status_code = 422
    code = "unprocessable_entity"


class RateLimited(AppError):
    status_code = 429
    code = "rate_limited"

    def __init__(self, message: str, retry_after_seconds: int = 60) -> None:
        super().__init__(message, retry_after_seconds=retry_after_seconds)


class ServiceUnavailable(AppError):
    status_code = 503
    code = "service_unavailable"


# --- Constraint violations -> (status, code, safe message) ------------------
# See Backend.md §8. A 500 here means "our bug, not the client's" and pages.
CONSTRAINT_ERRORS: dict[str, tuple[int, str, str]] = {
    "chk_appointment_slots_not_overbooked":
        (409, "slot_full", "This time slot is fully booked."),
    "uq_appointments_user_slot":
        (409, "already_booked", "You already have a booking for this slot."),
    "uq_appointment_slots":
        (409, "slot_already_exists", "A slot with this date and time already exists."),
    "chk_appointments_status":
        (422, "invalid_appointment_status", "That appointment status is not allowed."),
    "chk_documents_status":
        (422, "invalid_document_status", "That document status is not allowed."),
    "uq_users_national_id":
        (409, "duplicate_national_id", "This national ID is already registered."),
    "uq_users_email":
        (409, "duplicate_email", "This email address is already registered."),
    "uq_users_phone":
        (409, "duplicate_phone", "This phone number is already registered."),
    "chk_users_national_id_format":
        (422, "invalid_national_id", "National ID must be exactly 8 digits."),
    "chk_users_phone_format":
        (422, "invalid_phone", "Phone must be in the form +216XXXXXXXX."),
    "chk_verification_codes_purpose":
        (422, "invalid_code_purpose", "That verification purpose is not allowed."),
    "chk_verification_codes_channel":
        (422, "invalid_code_channel", "That verification channel is not allowed."),
    "fk_requests_service_office":
        (422, "service_not_offered", "This office does not offer that service."),
    "chk_documents_storage_key_not_url":
        (500, "internal_error", "An internal error occurred."),  # our bug, not theirs
    "uq_requests_tracking_code":
        (500, "internal_error", "An internal error occurred."),  # retry-worthy
    "chk_payments_amount_positive":
        (422, "invalid_amount", "Amount must be greater than zero."),
}

__all__ = [
    "CONSTRAINT_ERRORS",
    "AppError",
    "BadRequest",
    "CheckViolationError",
    "Conflict",
    "Forbidden",
    "ForeignKeyViolationError",
    "InsufficientPrivilegeError",
    "NotFound",
    "RateLimited",
    "ServiceUnavailable",
    "Unauthorized",
    "UniqueViolationError",
    "UnprocessableEntity",
]
