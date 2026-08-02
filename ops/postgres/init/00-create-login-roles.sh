#!/bin/sh
# ops/postgres/init/00-create-login-roles.sh
# Runs 00-create-login-roles.sql once the schema migration has created the
# NOLOGIN bundles. Executed by the `roles-init` compose service, not by the
# postgres entrypoint (the bundles do not exist at initdb time).
#
# Why: Watiq.sql §7 creates the five NOLOGIN permission bundles; the LOGIN
# users who hold them are an ops concern (Structure.md §7.1) and their
# passwords must never land in the schema file.
#
# Idempotent: psql without ON_ERROR_STOP keeps going after the
# "role already exists" errors on a re-run.
set -e

echo "roles-init: waiting for postgres..."
until pg_isready -h postgres -U watiq_migrate -d watiq >/dev/null 2>&1; do sleep 1; done

echo "roles-init: waiting for migration 0001 (NOLOGIN bundles)..."
until psql -h postgres -U watiq_migrate -d watiq -tAc \
    "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'watiq_%'" 2>/dev/null | grep -qE '^[5-9]$|^[1-9][0-9]+$'; do
    sleep 2
done

echo "roles-init: creating LOGIN users..."
psql -h postgres -U watiq_migrate -d watiq \
    -v citizen_pw="$CITIZEN_PW" \
    -v staff_pw="$STAFF_PW" \
    -v auth_pw="$AUTH_PW" \
    -v auditor_pw="$AUDITOR_PW" \
    -v admin_pw="$ADMIN_PW" \
    -f /init/00-create-login-roles.sql

echo "roles-init: done"
