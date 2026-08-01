-- ops/postgres/init/00-create-login-roles.sql
-- Creates the five LOGIN application users and grants them the NOLOGIN
-- permission bundles created by Watiq.sql §7 (ADR-001).
--
-- RUN AFTER THE SCHEMA MIGRATION: the NOLOGIN bundles do not exist before
-- migration 0001 runs, so `IN ROLE watiq_citizen` would fail. This file is
-- executed by the `roles-init` compose service, which waits for the
-- migration to complete first (Structure.md §7.1).
--
-- Invoked with psql variables:  psql -v citizen_pw=... -v staff_pw=... -f this-file
-- Idempotent by default: psql continues on error unless ON_ERROR_STOP is set,
-- so a re-run only fails the CREATE USER statements, which is expected.

CREATE USER watiq_app_citizen  LOGIN PASSWORD :'citizen_pw'  IN ROLE watiq_citizen;
CREATE USER watiq_app_staff    LOGIN PASSWORD :'staff_pw'    IN ROLE watiq_staff;
CREATE USER watiq_app_auth     LOGIN PASSWORD :'auth_pw'     IN ROLE watiq_auth;
CREATE USER watiq_app_auditor  LOGIN PASSWORD :'auditor_pw'  IN ROLE watiq_auditor;
CREATE USER watiq_app_admin    LOGIN PASSWORD :'admin_pw'    IN ROLE watiq_admin;

-- None of these own anything, so RLS applies to all of them.
-- The schema owner (watiq_migrate) is separate and never serves traffic.
ALTER ROLE watiq_app_citizen  CONNECTION LIMIT 40;
ALTER ROLE watiq_app_staff    CONNECTION LIMIT 40;
ALTER ROLE watiq_app_auth     CONNECTION LIMIT 15;
ALTER ROLE watiq_app_auditor  CONNECTION LIMIT 10;
ALTER ROLE watiq_app_admin    CONNECTION LIMIT 5;
