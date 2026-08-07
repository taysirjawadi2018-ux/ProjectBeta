#!/bin/sh
# ops/postgres/init/00-create-login-roles.sh
# Creates the five LOGIN application users once the schema migration has
# created the NOLOGIN bundles. Executed by the `roles-init` compose service,
# not by the postgres entrypoint (the bundles do not exist at initdb time).
#
# Why: Watiq.sql §7 creates the five NOLOGIN permission bundles; the LOGIN
# users who hold them are an ops concern (Structure.md §7.1) and their
# passwords must never land in the schema file.
#
# Idempotent: psql without ON_ERROR_STOP keeps going after the
# "role already exists" errors on a re-run.
#
# EVERY WAIT HERE IS BOUNDED. This script used to poll with a bare `until`
# loop and no deadline. When the migration ran against a different database
# than the one polled here — which is what happens the moment WATIQ_MIGRATE_DSN
# points somewhere else — the bundles never appeared, this container sat in
# `Created` forever, and because `api` depends on it completing, the API never
# started either. Nothing was ever logged; the stack simply hung. A wait that
# cannot fail cannot tell you why it is stuck, so both loops below now have a
# deadline and exit non-zero naming exactly what they waited for.
set -e

# Connection parameters come from the standard PG* environment variables set by
# the compose service (PGHOST/PGUSER/PGPASSWORD/PGDATABASE), so there is one
# place to change them and psql/pg_isready agree by construction.
: "${PGHOST:=postgres}"
: "${PGDATABASE:=watiq}"
export PGHOST PGDATABASE

# Deadlines in seconds. Generous: first-boot initdb on a Windows or macOS
# bind-mounted VM disk is slow, and the baseline migration is a large file.
PG_WAIT_TIMEOUT="${PG_WAIT_TIMEOUT:-120}"
MIGRATION_WAIT_TIMEOUT="${MIGRATION_WAIT_TIMEOUT:-300}"

echo "roles-init: waiting up to ${PG_WAIT_TIMEOUT}s for postgres at ${PGHOST}..."
deadline=$(( $(date +%s) + PG_WAIT_TIMEOUT ))
until pg_isready -q; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
        echo "roles-init: FATAL — postgres at '${PGHOST}' did not accept connections within ${PG_WAIT_TIMEOUT}s." >&2
        echo "roles-init: check that the 'postgres' service is healthy: docker compose ps postgres" >&2
        exit 1
    fi
    sleep 1
done
echo "roles-init: postgres is accepting connections"

# The migration creates the NOLOGIN bundles (watiq_citizen, watiq_staff,
# watiq_auth, watiq_auditor, watiq_admin). Five or more means 0001 has landed.
echo "roles-init: waiting up to ${MIGRATION_WAIT_TIMEOUT}s for migration 0001 (NOLOGIN bundles)..."
deadline=$(( $(date +%s) + MIGRATION_WAIT_TIMEOUT ))
while :; do
    bundles=$(psql -tAc \
        "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'watiq\\_%' AND NOT rolcanlogin" \
        2>/dev/null || echo 0)
    [ "${bundles:-0}" -ge 5 ] && break

    if [ "$(date +%s)" -ge "$deadline" ]; then
        echo "roles-init: FATAL — expected 5 NOLOGIN 'watiq_*' bundles in ${PGDATABASE} on ${PGHOST}, found ${bundles:-0} after ${MIGRATION_WAIT_TIMEOUT}s." >&2
        echo "roles-init: migration 0001 has not been applied to THIS database." >&2
        echo "roles-init: the usual cause is WATIQ_MIGRATE_DSN pointing at a different" >&2
        echo "roles-init: database than the DSN_* roles use. Check both:" >&2
        echo "roles-init:   docker compose config | grep -E 'DSN'" >&2
        echo "roles-init:   docker compose logs migrate" >&2
        exit 1
    fi
    sleep 2
done
echo "roles-init: found ${bundles} NOLOGIN bundles"

echo "roles-init: creating LOGIN users..."
psql -v citizen_pw="$CITIZEN_PW" \
     -v staff_pw="$STAFF_PW" \
     -v auth_pw="$AUTH_PW" \
     -v auditor_pw="$AUDITOR_PW" \
     -v admin_pw="$ADMIN_PW" \
     -f /init/00-create-login-roles.sql

echo "roles-init: done"
