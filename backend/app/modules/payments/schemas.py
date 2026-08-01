"""Pydantic models for the payments module (Structure.md §5).

Field names mirror Watiq.sql columns exactly — type_code maps to
payment_types.code, method_code to payment_methods.code, amount/currency to
the payments columns (Structure.md §5, Backend.md §7.1).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

CURRENCY_PATTERN = r"^[A-Z]{3}$"


class PaymentCreateIn(BaseModel):
    type_code: str = Field(min_length=1, max_length=50)
    method_code: str | None = Field(default=None, min_length=1, max_length=50)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    currency: str = Field(default="TND", pattern=CURRENCY_PATTERN)
    request_id: int | None = None


class PaymentConfirmIn(BaseModel):
    """Gateway callback payload; stands in for the ARQ reconcile job."""

    transaction_id: str | None = Field(default=None, max_length=255)
    method_code: str | None = Field(default=None, min_length=1, max_length=50)


class PaymentOut(BaseModel):
    id: int
    request_id: int | None = None
    amount: Decimal
    currency: str
    status: str
    paid_at: datetime | None = None
    created_at: datetime | None = None
    reference_masked: str | None = None
    transaction_masked: str | None = None


class PaymentListOut(BaseModel):
    items: list[PaymentOut]
    next_cursor: str | None = None
