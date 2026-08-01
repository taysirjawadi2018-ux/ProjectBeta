# Watiq (وثيق) — Tunisia's national portal for public legal services

A single platform for Tunisia's public legal services: civil status, identity
documents, transport, taxation, justice records, urbanism, and utility
subscriptions. Citizens request services online, track them by code, book
appointments, and pay statutory fees; government staff process requests within
their office's scope.

**Security posture:** the database is the innermost enforcement layer — RLS,
column-level grants, RBAC, trigger-owned columns, and an append-only read-audit
log. The backend's job is to tell the database who is asking, correctly, every
time, and never to work around it.

## Documentation map

| Document | Owns |
|---|---|
| [`Architecture.md`](./Architecture.md) | Technology choices, topology, trust boundaries, ADR summaries |
| [`Backend.md`](./Backend.md) | FastAPI design, the RLS session contract, Redis caching, auth |
| [`Structure.md`](./Structure.md) | Repository layout, layering rules, naming, migrations |
| [`Security.md`](./Security.md) | Threat model, firewall, WAF, IDS/IPS, OWASP mapping, CVE process |
| [`Watiq.sql`](./Watiq.sql) | **The schema.** Source of truth. Read it first. |
| [`docs/adr/`](./docs/adr/) | Architecture Decision Records |
| [`docs/runbooks/`](./docs/runbooks/) | Incident response, failover, rotation, offboarding, restore drills |

## Repository layout

```
Watiq.sql                    the schema — source of truth
backend/                     FastAPI modular monolith (Python 3.12)
ops/                         infrastructure config (nginx, WAF, IDS, postgres, redis, backup)
docs/                        ADRs and runbooks
docker-compose.yml           dev stack
docker-compose.prod.yml      prod overlay: secrets, hardening, replicas
Makefile                     canonical commands
```

## Quickstart (development)

Requires Docker, Python 3.12, and [uv](https://docs.astral.sh/uv/).

```bash
make dev-setup              # creates .env and generates dev JWT/MFA keys
make up                     # full stack: postgres, redis, minio, api, worker
make migrate                # (already automatic) apply schema migrations
```

The API listens on `http://127.0.0.1:8000` (documentation of the interactive
docs is denied in production; in dev they are available at `/docs`).

### Running the test suite

```bash
make test                   # full suite inside the api container
make test-security          # the RLS regression suite — must pass before any merge
```

The security suite needs real Postgres 15 + Redis (testcontainers), hence the
Docker requirement.

## Non-negotiables

- Never connect as the schema owner at runtime — RLS is inert for owners.
- SQL is parameterized, always; f-string SQL is banned by CI (Semgrep).
- Citizens' PII is never cached in Redis, never logged, never in a URL.
- `tests/security/` is load-bearing. A merge that turns it red is a revert.
- Secrets never enter git. `gitleaks` runs on every diff.

See [`Security.md`](./Security.md) §17 for the honest list of what this design
does *not* stop.
