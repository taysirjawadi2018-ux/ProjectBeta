# ADR-006 — The `service_catalog` / `office_services` split is load-bearing for the API

**Status:** Accepted (inherited from the schema)
**Date:** 2026-07
**Drivers:** `Watiq.sql` §3 (national catalogue)

## Context

The schema splits national service definitions (`service_catalog`, one row per
service that exists in the country) from per-office delivery
(`office_services`, which offices deliver what, with narrow local overrides).

This is not a normalization nicety. It is what makes:

- `/services/{slug}` a single clean national URL instead of ~350 duplicates;
- `v_service_availability` able to resolve `COALESCE(os.fee_override,
  sc.base_fee)` and `COALESCE(os.processing_time_override, sc.processing_time)`
  **in one place**;
- a search page that returns each service once, with an
  `available_office_count`, instead of 350 rows of the same birth certificate.

## Decision

The API mirrors the split exactly:

- `/services/…` — national, cacheable (Redis, namespace version `catalog`).
- `/services/{slug}/offices` — "where can I actually get this, and what will
  it cost me there".
- **The fee/SLA override rule is never re-implemented in Python.** The
  effective fee and effective SLA are read from `v_service_availability`
  (`Backend.md` §7.2). Re-implementing `COALESCE` in Python creates a second
  source of truth that will drift.

## Consequences

- One source of truth for effective fee and effective SLA.
- Two endpoints where a naive design would have one.
- A request always points at an `office_services` row, not at the national
  service — enforced by the composite FKs `fk_requests_service_office` and
  `fk_appointments_service_office`.

## Related

- `Architecture.md` §9 (summary), `Backend.md` §7.2, `Watiq.sql` §3.
