"""structlog configuration with a PII redaction processor.

Security.md §14.1. Every line carries request_id, principal_type,
principal_id, route, status, duration_ms. Redaction runs BEFORE rendering,
always — including in exception paths.
"""

from __future__ import annotations

import logging
from collections.abc import MutableMapping
from typing import Any

import structlog

REDACT_KEYS = frozenset({
    "password", "password_hash", "plain_password", "token", "access_token",
    "refresh_token", "refresh_token_hash", "authorization", "cookie",
    "mfa_secret", "code_hash", "otp", "recovery_code",
    "national_id", "cin",
    # Watiq.sql explicitly forbids these two in plaintext logs.
    "transaction_id", "reference_number",
    "form_data", "storage_key", "address", "date_of_birth",
})


def redact_pii(
    logger: Any,
    method_name: str,
    event_dict: MutableMapping[str, Any],
) -> MutableMapping[str, Any]:
    for key in list(event_dict):
        if key.lower() in REDACT_KEYS:
            event_dict[key] = "[REDACTED]"
    return event_dict


def configure_logging(debug: bool = False) -> None:
    logging.basicConfig(
        format="%(message)s",
        level=logging.DEBUG if debug else logging.INFO,
        force=True,
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            redact_pii,                       # BEFORE rendering, always
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if debug else logging.INFO
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
