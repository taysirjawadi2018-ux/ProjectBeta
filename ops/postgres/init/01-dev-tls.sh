#!/bin/bash
# ops/postgres/init/01-dev-tls.sh
# DEV ONLY. Generates a self-signed TLS certificate for Postgres so the
# application's `ssl=require` connection works in the local compose stack.
#
# Why a self-signed cert in dev: asyncpg connects with ssl='require' (TLS with
# no peer verification, Backend.md §4.1), so no trust chain is needed — but
# Postgres will not enable ssl at all without a certificate. Production
# certificates come from the national CA via Docker secrets, never from here.
#
# Runs inside docker-entrypoint-initdb.d (before the server starts for the
# first time) and persists into PGDATA; subsequent starts reuse the files.
set -euo pipefail

CERT_DIR="$PGDATA/certs"
if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
    echo "dev-tls: certificate already present, skipping"
    exit 0
fi

echo "dev-tls: generating self-signed certificate in $CERT_DIR"
mkdir -p "$CERT_DIR"
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -subj "/CN=postgres/O=watiq-dev" \
    -addext "subjectAltName=DNS:postgres,DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1

chown postgres:postgres "$CERT_DIR" "$CERT_DIR/server.key" "$CERT_DIR/server.crt"
chmod 600 "$CERT_DIR/server.key"
echo "dev-tls: done"
