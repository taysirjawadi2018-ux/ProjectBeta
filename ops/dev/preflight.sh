#!/usr/bin/env bash
# ops/dev/preflight.sh — check this machine can run the dev stack.
#
# Run it with `make doctor`, or directly. It changes nothing; it only reports.
#
# Why this exists: every check below corresponds to a failure that used to
# happen halfway through `docker compose up`, after several containers had
# already started, with an error that named a symptom rather than a cause. A
# port collision surfaced as an api container that would not attach; a stale
# .env surfaced as alembic failing to resolve a hostname. Finding these before
# anything starts turns a confusing ten-minute debug into a one-line fix.
set -uo pipefail

cd "$(dirname "$0")/../.."

FAIL=0
WARN=0
ok()   { printf '  \033[32mok\033[0m    %s\n' "$*"; }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$*"; WARN=$((WARN+1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAIL=$((FAIL+1)); }

echo
echo "Watiq dev stack preflight"
echo "========================="

# --- Docker ----------------------------------------------------------------
echo
echo "Docker"
if ! command -v docker >/dev/null 2>&1; then
  bad "docker not found on PATH — install Docker Desktop or Docker Engine"
else
  if docker info >/dev/null 2>&1; then
    ok "docker daemon is running ($(docker version --format '{{.Server.Version}}' 2>/dev/null))"
  else
    bad "docker is installed but the daemon is not reachable — start Docker Desktop"
  fi
fi

if docker compose version >/dev/null 2>&1; then
  ok "docker compose v2 available ($(docker compose version --short 2>/dev/null))"
else
  bad "\`docker compose\` (v2) not available. The v1 \`docker-compose\` script cannot
        read this file: it uses service_completed_successfully conditions and profiles."
fi

# --- Architecture ----------------------------------------------------------
echo
echo "Architecture"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64)  ok "$ARCH — all images have a native manifest" ;;
  aarch64|arm64) ok "$ARCH — all default-profile images are multi-arch.
        Note: the optional 'av' profile (ClamAV) is amd64-only and will
        run under emulation or not at all." ;;
  *)             warn "$ARCH is unusual; image manifests may not cover it" ;;
esac

# --- Host ports ------------------------------------------------------------
# Only these two are published. Everything else stays on internal networks.
echo
echo "Host ports"
port_busy() {
  if command -v ss >/dev/null 2>&1;     then ss -ltn 2>/dev/null    | grep -qE "[:.]$1[[:space:]]"; return $?; fi
  if command -v netstat >/dev/null 2>&1; then netstat -ltn 2>/dev/null | grep -qE "[:.]$1[[:space:]]"; return $?; fi
  if command -v lsof >/dev/null 2>&1;   then lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; return $?; fi
  return 1
}
holder() {
  docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null \
    | grep -E "(^|[:.])$1->|:$1->" | cut -f1 | paste -sd, -
}

# Read overrides straight from .env so the report matches what compose will do.
API_PORT="$(grep -E '^[[:space:]]*API_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
FRONTEND_PORT="$(grep -E '^[[:space:]]*FRONTEND_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '[:space:]')"
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5000}"

for pair in "API_PORT:$API_PORT" "FRONTEND_PORT:$FRONTEND_PORT"; do
  var="${pair%%:*}"; port="${pair##*:}"
  if port_busy "$port"; then
    by="$(holder "$port")"
    ours="$(docker compose ps -q 2>/dev/null | xargs -r docker inspect --format '{{.Name}}' 2>/dev/null | tr -d '/' | paste -sd, -)"
    if [ -n "$by" ] && [ -n "$ours" ] && echo "$ours" | grep -q "$by"; then
      ok "$port ($var) held by this stack already — fine"
    else
      bad "$port ($var) is already in use${by:+ by container: $by}
        Fix:  echo '$var=$((port+1))' >> .env"
    fi
  else
    ok "$port ($var) is free"
  fi
done

# --- .env ------------------------------------------------------------------
# The stack is designed to run with no .env at all. When one exists, every key
# in it overrides a compose default, so a stale value here beats a good default.
echo
echo ".env overrides"
if [ ! -f .env ]; then
  ok "no .env — compose defaults will be used (this is a supported setup)"
else
  ok ".env present (overrides compose defaults)"
  if grep -qE '^[[:space:]]*(WATIQ_MIGRATE_DSN|DSN_[A-Z]+)=' .env; then
    warn "DSN overrides are active in .env, so the stack will NOT use its local
        Postgres. Start it with the remote-database overlay:
          make up-remote
        Plain \`make up\` leaves roles-init polling the local Postgres for a
        migration that landed in the remote one; it fails and blocks api.
        Confirm what compose resolved:
          docker compose config | grep -E 'DSN'"
    # A DSN whose password holds a raw reserved/non-ASCII character parses into
    # the wrong host and fails with a misleading error.
    if grep -E '^[[:space:]]*(WATIQ_MIGRATE_DSN|DSN_[A-Z]+)=' .env \
       | grep -qP '://[^:]+:[^@]*[^\x00-\x7F@/]*[^\x00-\x7F][^@]*@'; then
      bad "a DSN password contains a non-ASCII character that is not percent-encoded.
        Encode it:  python -c \"import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))\" 'pw'"
    fi
  else
    ok "no DSN overrides — using the local Postgres"
  fi
fi

# --- Bind-mounted scripts --------------------------------------------------
# These two are mounted from the working tree into containers, bypassing git,
# so a CR that .gitattributes would have stripped can still reach a shell.
echo
echo "Bind-mounted scripts"
for f in ops/postgres/init/01-dev-tls.sh ops/postgres/init/00-create-login-roles.sh; do
  if [ ! -f "$f" ]; then
    bad "$f is missing — pg-tls-init/roles-init will fail to start"
  elif grep -qU $'\r' "$f" 2>/dev/null; then
    warn "$f has CRLF line endings. The compose entrypoint strips them, so this
        still works, but fix the source:  sed -i 's/\\r\$//' $f"
  else
    ok "$f (LF)"
  fi
done

# --- Disk ------------------------------------------------------------------
echo
echo "Disk"
avail_kb="$(df -Pk . 2>/dev/null | awk 'NR==2{print $4}')"
if [ -n "${avail_kb:-}" ]; then
  avail_gb=$(( avail_kb / 1024 / 1024 ))
  # Images alone are ~2.5 GB; add build cache and the pg/minio volumes.
  if [ "$avail_gb" -lt 5 ]; then
    bad "${avail_gb}G free — the images and volumes need roughly 5G"
  else
    ok "${avail_gb}G free"
  fi
fi

echo
echo "-------------------------------------------------------------"
if [ "$FAIL" -gt 0 ]; then
  echo "$FAIL blocking problem(s), $WARN warning(s). Fix the FAILs, then: make up"
  exit 1
fi
echo "Ready. ${WARN} warning(s). Start the stack with: make up"
echo
exit 0
