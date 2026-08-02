#!/usr/bin/env bash
#
# Weekly restore drill (Security.md §15). Cron; failure is a P1 alert.
#
# A backup that has never been restored is a hypothesis, not a backup. This
# script turns that hypothesis into a weekly test.
#
# The critical part is not that files came back. It is the SQL block below,
# which proves the restored cluster still carries the ACCESS-CONTROL MODEL. A
# restore that returns every row but loses the RLS policies looks exactly like a
# success — the application starts, queries work, and every citizen can read
# every other citizen's file. That failure mode is why this script asserts
# policy counts and not just row counts.
#
#   crontab:  17 3 * * 0  /opt/watiq/ops/backup/restore-drill.sh

set -euo pipefail

DRILL_DIR=${DRILL_DIR:-/var/lib/postgresql/drill}
DRILL_PORT=${DRILL_PORT:-5499}
STANZA=${STANZA:-watiq}
TARGET_TIME="$(date -u -d '2 hours ago' '+%Y-%m-%d %H:%M:%S+00')"

# Watiq.sql defines 63 policies across 14 tables. The floor of 60 tolerates
# deliberate consolidation but catches a restore that dropped the model.
# tests/conftest.py asserts the exact number; this asserts the floor.
MIN_POLICIES=${MIN_POLICIES:-60}

log() { printf '[restore-drill] %s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }

cleanup() {
    if pg_ctl -D "$DRILL_DIR" status >/dev/null 2>&1; then
        log "stopping drill cluster"
        pg_ctl -D "$DRILL_DIR" -w stop >/dev/null 2>&1 || true
    fi
}
# Runs on success, failure and interrupt. Without it a failed drill leaves a
# postgres listening on 5499 with a full copy of the citizen database.
trap cleanup EXIT INT TERM

log "restoring stanza=$STANZA to $TARGET_TIME"
rm -rf "$DRILL_DIR"
mkdir -p "$DRILL_DIR"
chmod 0700 "$DRILL_DIR"

pgbackrest --stanza="$STANZA" --type=time --target="$TARGET_TIME" \
           --pg1-path="$DRILL_DIR" --delta restore

log "starting drill cluster on port $DRILL_PORT"
pg_ctl -D "$DRILL_DIR" -o "-p $DRILL_PORT" -w start

log "verifying the restore is USABLE, not merely present"
psql -p "$DRILL_PORT" -d watiq -v ON_ERROR_STOP=1 -X <<SQL
\set QUIET on
\timing off

-- Each block raises rather than returning a boolean, so ON_ERROR_STOP makes a
-- failed assertion a non-zero exit. A SELECT returning 'false' would print
-- happily and exit 0 — the drill would pass while the restore was broken.

DO \$\$
BEGIN
    IF (SELECT count(*) FROM users) = 0 THEN
        RAISE EXCEPTION 'restore has no users';
    END IF;
END \$\$;

DO \$\$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_roles
     WHERE rolname IN ('watiq_citizen','watiq_staff','watiq_auth',
                       'watiq_auditor','watiq_admin');
    IF n <> 5 THEN
        RAISE EXCEPTION 'expected 5 watiq roles, found %', n;
    END IF;
END \$\$;

-- The security model must survive the restore, not just the data.
DO \$\$
BEGIN
    IF NOT (SELECT bool_and(relrowsecurity) FROM pg_class
             WHERE relname IN ('users','requests','documents','payments','appointments')) THEN
        RAISE EXCEPTION 'RLS is NOT enabled on one or more core tables after restore';
    END IF;
END \$\$;

DO \$\$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public';
    IF n < $MIN_POLICIES THEN
        RAISE EXCEPTION 'only % RLS policies survived the restore (expected >= $MIN_POLICIES)', n;
    END IF;
END \$\$;

-- security_invoker on views is load-bearing; without it a restored view hands
-- back rows the caller's own policies would deny.
DO \$\$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public' AND c.relkind = 'v'
       AND NOT coalesce(('security_invoker=true') = ANY(c.reloptions), false);
    IF n > 0 THEN
        RAISE EXCEPTION '% view(s) lost security_invoker in the restore', n;
    END IF;
END \$\$;

-- The trigger that generates tracking codes must still be attached.
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
                    WHERE tgname = 'trg_requests_before_insert' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'trg_requests_before_insert missing after restore';
    END IF;
END \$\$;
SQL

log "restore drill OK for $TARGET_TIME"
