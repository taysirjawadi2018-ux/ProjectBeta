"""The frozen identity bundle that selects a DB role and an RLS scope.

Backend.md §4.3. A Principal is what the FastAPI dependencies hand the service
layer; `rls_transaction()` turns it into the three session GUCs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class DbRole(StrEnum):
    """The five DB roles, one per engine, one per NOLOGIN bundle (ADR-001).

    Values are the bundle names from Watiq.sql §7 — each bundle owns exactly
    the privileges RLS grants to its members.
    """

    CITIZEN = "watiq_citizen"
    STAFF = "watiq_staff"
    AUTH = "watiq_auth"
    AUDITOR = "watiq_auditor"
    ADMIN = "watiq_admin"


@dataclass(frozen=True, slots=True)
class Principal:
    db_role: DbRole
    user_id: int | None = None
    staff_id: int | None = None
    office_id: int | None = None
    role_code: str | None = None          # 'clerk', 'director', ...
    permissions: frozenset[str] = field(default_factory=frozenset)
    session_id: str | None = None
    mfa_satisfied: bool = False

    @property
    def is_staff(self) -> bool:
        return self.staff_id is not None

    @property
    def is_authenticated(self) -> bool:
        return self.user_id is not None or self.staff_id is not None
