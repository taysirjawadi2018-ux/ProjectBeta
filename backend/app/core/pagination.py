"""Cursor pagination helpers (Security.md §7.2, Backend.md §11).

Opaque cursors instead of offset: an offset-based page can scan a growing
table from the start on every request, and reveals table volume. The cursor
encodes the last row's sort key; keyset WHERE clauses keep the query bounded.
"""

from __future__ import annotations

import base64
import json
from typing import Any


def encode_cursor(**values: Any) -> str:
    raw = json.dumps(values, separators=(",", ":"), default=str)
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> dict[str, Any]:
    if not cursor:
        return {}
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(padded.encode()))
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}


MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


def page_size(size: int | None) -> int:
    if size is None:
        return DEFAULT_PAGE_SIZE
    return max(1, min(size, MAX_PAGE_SIZE))
