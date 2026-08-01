"""auth module exceptions.

Most flows raise core AppError subclasses; this module adds the small number
of auth-specific failure modes and maps them to RFC 9457 codes.
"""

from app.core.errors import Unauthorized


class InvalidCredentials(Unauthorized):
    """Identical to 'no such user', and deliberately so (Backend.md §6.5):
    lockout state must never become an account-existence oracle."""

    code = "invalid_credentials"

    def __init__(self) -> None:
        super().__init__("Incorrect login details.")


class AccountLocked(Unauthorized):
    code = "account_locked"

    def __init__(self) -> None:
        super().__init__("Account temporarily locked. Try again later.")
