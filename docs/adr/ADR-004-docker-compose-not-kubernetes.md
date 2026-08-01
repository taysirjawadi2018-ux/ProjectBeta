# ADR-004 — Docker Compose, not Kubernetes

**Status:** Accepted
**Date:** 2026-07

## Context

The platform must run in national government infrastructure on sovereign
hardware. Two candidate runtimes: Kubernetes and Docker Compose.

## Decision

**Docker Compose** on a small number of hardened hosts, with Nginx
load-balancing across API replicas.

Rationale:

1. **The load profile does not require elastic scaling.** Tunisia is ~12M
   people; the peak is a national deadline (tax declarations), which is a
   *read* spike solved by Redis and read replicas, not by pod autoscaling
   (`Architecture.md` §2).
2. **A national platform team should run a topology it can fully reason
   about.** Fewer moving parts is a security property.
3. **Kubernetes carries a large attack surface of its own** — API server, RBAC,
   admission control, CNI, etcd — which must itself be hardened. A government
   portal's threat model does not need to include "compromised control plane".
4. **Self-managed rolling deploys are enough** for a single release train
   (`Architecture.md` §2: one product, one deploy).

The alternative remains a documented migration path, not a rewrite: the
container images are unchanged either way, so moving to Kubernetes would be a
change of orchestration, not of application code.

## Consequences

- Manual scaling: `docker compose up -d --scale api=4` (prod overlay uses
  `deploy.replicas`).
- Self-managed rolling deploys: drain one API replica at a time behind Nginx.
- Host placement, backups, and failover are the operator's job — documented in
  `docs/runbooks/` (db-failover, restore-drill).
- Revisit if sustained load or multi-datacenter HA demands it.

## Related

- `Architecture.md` §3.2, §5 (topology), §9 (summary).
