.ONESHELL:
.PHONY: up down migrate test test-security test-frontend lint scan fmt dev-setup dev-keys frontend-build frontend-dev

up:              ## dev stack (API + BFF frontend on 127.0.0.1:5000)
	docker compose up -d --build

down:
	docker compose down

migrate:         ## run as the migration user, never an app role
	docker compose exec api alembic upgrade head

test:
	docker compose exec api pytest -q

test-security:   ## the RLS regression suite — must pass before any merge
	docker compose exec api pytest tests/security/ -v

test-frontend:   ## BFF routes, guards and the dead-control gate
	cd frontend_flask && .venv/bin/python -m pytest tests/ -q

frontend-build:  ## compile the design tokens to a static stylesheet
	cd frontend_flask && npm install --no-audit --no-fund && npm run build

frontend-dev:    ## run the BFF against a local API, rebuilding CSS on change
	cd frontend_flask && npm run watch & \
	cd frontend_flask && .venv/bin/python app.py

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
	uv run --project backend python ops/dev/gen_dev_keys.py
