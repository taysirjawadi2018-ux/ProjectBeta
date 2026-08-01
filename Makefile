.ONESHELL:
.PHONY: up down migrate test test-security lint scan fmt dev-setup dev-keys

up:              ## dev stack
	docker compose up -d --build

down:
	docker compose down

migrate:         ## run as the migration user, never an app role
	docker compose exec api alembic upgrade head

test:
	docker compose exec api pytest -q

test-security:   ## the RLS regression suite — must pass before any merge
	docker compose exec api pytest tests/security/ -v

lint:
	ruff check backend && ruff format --check backend
	mypy backend/app/core --strict
	lint-imports --config backend/.importlinter

scan:            ## see Security.md §12
	pip-audit -r backend/requirements.lock
	bandit -r backend/app -ll
	semgrep --config=p/python --config=ops/semgrep/watiq.yml backend/
	trivy image watiq-api:latest --severity HIGH,CRITICAL --exit-code 1
	gitleaks detect --no-git

fmt:
	ruff format backend && ruff check --fix backend

dev-setup:       ## first run: create .env from the example and generate dev keys
	test -f .env || cp .env.example .env
	$(MAKE) dev-keys

dev-keys:        ## dev-only Ed25519 JWT keypair + MFA KEK; NEVER for production
	uv run --project backend python - <<'PY'
import base64, secrets
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

env = Path(".env")
if not env.exists():
    raise SystemExit("missing .env — run: cp .env.example .env")

key = Ed25519PrivateKey.generate()
priv = key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode().strip()
pub = key.public_key().public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
).decode().strip()
kek = base64.b64encode(secrets.token_bytes(32)).decode()

def set_var(lines, name, value):
    out = []
    replaced = False
    for line in lines:
        if line.startswith(name + "="):
            out.append(f"{name}=\"{value.replace(chr(10), chr(92) + 'n')}\"")
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f"{name}=\"{value}\"")
    return out

lines = env.read_text(encoding="utf-8").splitlines()
for name, value in (("JWT_PRIVATE_KEY", priv), ("JWT_PUBLIC_KEY", pub),
                    ("MFA_ENCRYPTION_KEY", kek)):
    lines = set_var(lines, name, value)
env.write_text("\n".join(lines) + "\n", encoding="utf-8")
print("dev keys written to .env")
PY
