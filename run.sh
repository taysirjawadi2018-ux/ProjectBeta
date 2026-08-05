#!/usr/bin/env bash
#
# Watiq — start the backend API and the Flask BFF frontend.
#
#   ./run.sh                 both services (Docker if available, otherwise native)
#   ./run.sh --native        both services natively without Docker
#   ./run.sh --local         API in Docker, BFF natively with a CSS watcher
#   ./run.sh --build         force a rebuild of the api/frontend images first
#   ./run.sh logs [service]  follow logs (all services, or just one)
#   ./run.sh status          what is running and on which port
#   ./run.sh stop            stop the stack, keeping volumes
#   ./run.sh reset           stop and DELETE volumes (Postgres, MinIO, Redis)
#
# If Docker is installed and running, `docker compose up` starts the full containerized
# stack. If Docker is missing or unreachable, run.sh automatically falls back to native
# mode (API and BFF running natively via Python).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:5000"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[36m›\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# --- prerequisites --------------------------------------------------------
compose() { docker compose "$@"; }

has_docker() {
  command -v docker >/dev/null 2>&1 &&
    docker compose version >/dev/null 2>&1 &&
    docker info >/dev/null 2>&1
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is not installed or not on PATH"
  docker compose version >/dev/null 2>&1 ||
    die "the docker compose plugin is missing (install docker-compose-plugin)"
  docker info >/dev/null 2>&1 ||
    die "the Docker daemon is not reachable — start Docker Desktop and retry"
}

# --- first-run bootstrap --------------------------------------------------
# The API refuses to boot without a JWT keypair and an MFA key. `make dev-setup`
# generates them; doing it here means a fresh clone runs with one command.
bootstrap_env() {
  if [[ ! -f .env ]]; then
    info "no .env found — seeding it from .env.example"
    cp .env.example .env
  fi

  if grep -qE '^JWT_PRIVATE_KEY=.+' .env; then
    return
  fi

  warn ".env has no JWT_PRIVATE_KEY — generating a DEV-ONLY keypair"
  if command -v uv >/dev/null 2>&1; then
    uv run --project backend python ops/dev/gen_dev_keys.py
  elif [[ -x backend/.venv/bin/python ]]; then
    backend/.venv/bin/python ops/dev/gen_dev_keys.py
  elif command -v python3 >/dev/null 2>&1; then
    python3 ops/dev/gen_dev_keys.py
  else
    die "python/uv is not installed, so the dev keys cannot be generated."
  fi
}

# --- waiting --------------------------------------------------------------
# Polls /healthz rather than sleeping: the migration and role-init containers
# have to finish before the API answers, and how long that takes depends on
# whether the Postgres volume already exists.
wait_for() {
  local name="$1" url="$2" tries="${3:-60}" n=0
  info "waiting for $name at $url"
  while (( n++ < tries )); do
    if curl -fsS --max-time 2 "$url/healthz" >/dev/null 2>&1; then
      bold "  ✓ $name is up"
      return 0
    fi
    sleep 2
  done
  warn "$name did not answer /healthz after $((tries * 2))s"
  warn "check the logs with: ./run.sh logs"
  return 1
}

# --- modes ----------------------------------------------------------------
up_docker() {
  local build_flag=("$@")
  require_docker
  bootstrap_env

  info "starting the full stack (postgres, redis, minio, api, frontend)"
  compose up -d "${build_flag[@]}"

  wait_for "API" "$API_URL" || true
  wait_for "frontend" "$FRONTEND_URL" || true

  echo
  bold "Watiq is running"
  echo "  frontend  $FRONTEND_URL"
  echo "  API       $API_URL      (docs at $API_URL/docs)"
  echo
  echo "  logs      ./run.sh logs [api|frontend]"
  echo "  stop      ./run.sh stop"
}

up_local() {
  require_docker
  bootstrap_env

  local venv="frontend_flask/.venv/bin/python"
  [[ -x "$venv" ]] ||
    die "frontend_flask/.venv is missing. Create it with:
     python3 -m venv frontend_flask/.venv &&
     frontend_flask/.venv/bin/pip install -r frontend_flask/requirements.txt"

  info "starting the API and its dependencies in Docker"
  compose up -d api
  wait_for "API" "$API_URL" || die "the API never came up; ./run.sh logs api"

  # Tailwind has to have compiled at least once or every page renders unstyled.
  if [[ ! -s frontend_flask/static/css/watiq.css ]]; then
    info "compiling the stylesheet for the first time"
    (cd frontend_flask && npm install --no-audit --no-fund && npm run build)
  fi

  local watcher=""
  if command -v npm >/dev/null 2>&1; then
    info "watching static/src and templates for CSS changes"
    (cd frontend_flask && npm run watch >/tmp/watiq-tailwind.log 2>&1) &
    watcher=$!
  else
    warn "npm not found — CSS will not rebuild as you edit templates"
  fi

  # Kill the watcher whichever way Flask exits, including Ctrl-C.
  cleanup() {
    [[ -n "$watcher" ]] && kill "$watcher" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  echo
  bold "Frontend (native) → $FRONTEND_URL   API (docker) → $API_URL"
  echo "  Tailwind log: /tmp/watiq-tailwind.log"
  echo

  # Flask's reloader picks up template and view edits without a restart.
  cd frontend_flask
  WATIQ_API_URL="$API_URL" ENV=dev DEBUG=true FLASK_DEBUG=1 .venv/bin/python app.py
}

up_native() {
  bootstrap_env

  local backend_python="backend/.venv/bin/python"
  local frontend_python="frontend_flask/.venv/bin/python"

  if [[ ! -x "$backend_python" ]]; then
    if command -v python3 >/dev/null 2>&1; then
      backend_python="python3"
    else
      die "Python 3 is required but not found."
    fi
  fi

  if [[ ! -x "$frontend_python" ]]; then
    if command -v python3 >/dev/null 2>&1; then
      info "creating frontend_flask/.venv"
      python3 -m venv frontend_flask/.venv && frontend_flask/.venv/bin/pip install -r frontend_flask/requirements.txt
      frontend_python="frontend_flask/.venv/bin/python"
    else
      frontend_python="python3"
    fi
  fi

  if [[ ! -s frontend_flask/static/css/watiq.css ]] && command -v npm >/dev/null 2>&1; then
    info "compiling the stylesheet for the first time"
    (cd frontend_flask && npm install --no-audit --no-fund && npm run build)
  fi

  local watcher_pid=""
  if command -v npm >/dev/null 2>&1; then
    info "watching static/src and templates for CSS changes"
    (cd frontend_flask && npm run watch >/tmp/watiq-tailwind.log 2>&1) &
    watcher_pid=$!
  else
    warn "npm not found — CSS will not rebuild as you edit templates"
  fi

  info "starting API server natively on port 8000"
  local api_pid=""
  if command -v uv >/dev/null 2>&1; then
    (cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 >/tmp/watiq-api.log 2>&1) &
    api_pid=$!
  else
    (cd backend && "$ROOT/$backend_python" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >/tmp/watiq-api.log 2>&1) &
    api_pid=$!
  fi

  cleanup() {
    info "shutting down native processes..."
    [[ -n "$watcher_pid" ]] && kill "$watcher_pid" 2>/dev/null || true
    [[ -n "$api_pid" ]] && kill "$api_pid" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  wait_for "API" "$API_URL" || die "the API never came up; check /tmp/watiq-api.log"

  echo
  bold "Watiq is running natively"
  echo "  frontend  $FRONTEND_URL"
  echo "  API       $API_URL      (docs at $API_URL/docs)"
  echo "  API log:  /tmp/watiq-api.log"
  echo "  CSS log:  /tmp/watiq-tailwind.log"
  echo

  cd frontend_flask
  WATIQ_API_URL="$API_URL" ENV=dev DEBUG=true FLASK_DEBUG=1 "$ROOT/$frontend_python" app.py
}

# --- entrypoint -----------------------------------------------------------
case "${1:-up}" in
  up|"")
    if has_docker; then
      up_docker
    else
      warn "Docker / docker compose is not available — running in native mode"
      up_native
    fi
    ;;
  --native|--no-docker|-n)
    up_native
    ;;
  --build|-b)
    if has_docker; then
      up_docker --build
    else
      warn "Docker is not available — running in native mode"
      up_native
    fi
    ;;
  --local|-l)
    if has_docker; then
      up_local
    else
      warn "Docker is not available — running both API and frontend natively"
      up_native
    fi
    ;;
  logs)
    if has_docker; then
      compose logs -f --tail=100 ${2:+"$2"}
    else
      info "Native log files:"
      info "  API log:      /tmp/watiq-api.log"
      info "  Tailwind log: /tmp/watiq-tailwind.log"
      if [[ -f /tmp/watiq-api.log ]]; then
        tail -f /tmp/watiq-api.log
      fi
    fi
    ;;
  status)
    if has_docker; then
      compose ps
    else
      info "Checking native process status:"
      pgrep -fl "uvicorn\|app.py\|tailwind" || info "No native processes running."
    fi
    ;;
  stop|down)
    if has_docker; then
      compose down
      bold "stopped Docker stack"
    fi
    info "stopping native processes..."
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    pkill -f "app.py" 2>/dev/null || true
    bold "stopped native processes"
    ;;
  reset)
    if has_docker; then
      warn "this deletes the Postgres, MinIO and Redis volumes"
      read -r -p "type 'yes' to continue: " reply
      [[ "$reply" == "yes" ]] || die "aborted"
      compose down -v
      bold "stack removed, volumes deleted"
    fi
    info "stopping native processes..."
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    pkill -f "app.py" 2>/dev/null || true
    bold "stopped native processes"
    ;;
  -h|--help|help)
    # Print the header comment and stop at the first line of actual code.
    awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' \
      "${BASH_SOURCE[0]}"
    ;;
  *)
    die "unknown command '$1' — try ./run.sh --help"
    ;;
esac

