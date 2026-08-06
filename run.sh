#!/usr/bin/env bash
#
# Watiq — Universal Bootstrapper, Dependency Installer & Server Runner
#
# Usage:
#   ./run.sh                 Start both services (Docker if available, otherwise native fallback)
#   ./run.sh --native        Start services natively (Python + Tailwind watcher)
#   ./run.sh --local         API in Docker, Flask BFF natively
#   ./run.sh --build         Rebuild Docker images and start stack
#   ./run.sh setup           Install all tools, dependencies & build frontend CSS
#   ./run.sh migrate         Run Alembic database migrations
#   ./run.sh test            Run backend & frontend test suites
#   ./run.sh logs [service]  Follow logs (all services, or specific service)
#   ./run.sh status          Check status of running containers/processes
#   ./run.sh stop            Stop stack and native processes
#   ./run.sh reset           Stop stack, purge Docker volumes and native logs
#   ./run.sh help            Show this help message
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5000}"
API_URL="http://127.0.0.1:${API_PORT}"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"

LOG_DIR="${TMPDIR:-/tmp}"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="."

# --- output helpers -------------------------------------------------------
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[36m›\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*">&2; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# --- platform & package manager detection ---------------------------------
detect_os() {
  case "$(uname -s 2>/dev/null || echo "unknown")" in
    Linux*)             echo "linux";;
    Darwin*)            echo "macos";;
    CYGWIN*|MINGW*|MSYS*) echo "windows";;
    *)                  echo "unknown";;
  esac
}

detect_pkg_mgr() {
  if command -v apt-get >/dev/null 2>&1; then echo "apt"
  elif command -v brew >/dev/null 2>&1; then echo "brew"
  elif command -v dnf >/dev/null 2>&1; then echo "dnf"
  elif command -v pacman >/dev/null 2>&1; then echo "pacman"
  elif command -v zypper >/dev/null 2>&1; then echo "zypper"
  elif command -v apk >/dev/null 2>&1; then echo "apk"
  elif command -v winget >/dev/null 2>&1; then echo "winget"
  elif command -v choco >/dev/null 2>&1; then echo "choco"
  else echo "none"; fi
}

# --- path auto-discovery for universal OS support --------------------------
add_to_path_if_dir() {
  local p="$1"
  if [[ -d "$p" && ":$PATH:" != *":$p:"* ]]; then
    export PATH="$p:$PATH"
  fi
}

USER_NAME="${USER:-${USERNAME:-}}"
for candidate in \
  "$HOME/.local/bin" \
  "$HOME/.cargo/bin" \
  "$HOME/bin" \
  "/c/Program Files/nodejs" \
  "/c/Program Files (x86)/nodejs" \
  "/c/Python313" \
  "/c/Python313/Scripts" \
  "/c/Python312" \
  "/c/Python312/Scripts" \
  "/c/Python311" \
  "/c/Python311/Scripts" \
  "/c/Users/$USER_NAME/AppData/Local/Programs/Python/Python313" \
  "/c/Users/$USER_NAME/AppData/Local/Programs/Python/Python313/Scripts" \
  "/c/Users/$USER_NAME/AppData/Local/Programs/Python/Python312" \
  "/c/Users/$USER_NAME/AppData/Local/Programs/Python/Python312/Scripts" \
  "/c/Users/$USER_NAME/AppData/Roaming/npm" \
  "/usr/local/bin" \
  "/usr/bin"
do
  add_to_path_if_dir "$candidate"
done

# --- python & node command helpers ----------------------------------------
find_python_cmd() {
  local dir="${1:-.}"
  local abs_dir="$ROOT/$dir"
  if [[ -f "$abs_dir/.venv/bin/python" ]]; then
    echo "$abs_dir/.venv/bin/python"
  elif [[ -f "$abs_dir/.venv/Scripts/python.exe" ]]; then
    echo "$abs_dir/.venv/Scripts/python.exe"
  elif [[ -f "$abs_dir/.venv/Scripts/python" ]]; then
    echo "$abs_dir/.venv/Scripts/python"
  elif [[ -f "$ROOT/.venv/bin/python" ]]; then
    echo "$ROOT/.venv/bin/python"
  elif [[ -f "$ROOT/.venv/Scripts/python.exe" ]]; then
    echo "$ROOT/.venv/Scripts/python.exe"
  elif command -v python3 >/dev/null 2>&1; then
    command -v python3
  elif command -v python >/dev/null 2>&1; then
    command -v python
  elif command -v py >/dev/null 2>&1; then
    command -v py
  else
    echo ""
  fi
}

get_base_python() {
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
  elif command -v python >/dev/null 2>&1; then
    command -v python
  elif command -v py >/dev/null 2>&1; then
    command -v py
  elif [[ -x "/c/Python313/python.exe" ]]; then
    echo "/c/Python313/python.exe"
  elif [[ -x "/c/Python312/python.exe" ]]; then
    echo "/c/Python312/python.exe"
  else
    echo ""
  fi
}

find_npm_cmd() {
  if command -v npm >/dev/null 2>&1; then
    command -v npm
  elif command -v npm.cmd >/dev/null 2>&1; then
    command -v npm.cmd
  elif [[ -x "/c/Program Files/nodejs/npm.cmd" ]]; then
    echo "/c/Program Files/nodejs/npm.cmd"
  elif [[ -x "/c/Program Files/nodejs/npm" ]]; then
    echo "/c/Program Files/nodejs/npm"
  else
    echo ""
  fi
}

find_node_cmd() {
  if command -v node >/dev/null 2>&1; then
    command -v node
  elif command -v node.exe >/dev/null 2>&1; then
    command -v node.exe
  elif [[ -x "/c/Program Files/nodejs/node.exe" ]]; then
    echo "/c/Program Files/nodejs/node.exe"
  elif [[ -x "/c/Program Files/nodejs/node" ]]; then
    echo "/c/Program Files/nodejs/node"
  else
    echo ""
  fi
}

run_with_timeout() {
  local sec="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$sec" "$@" || return $?
  else
    "$@" || return $?
  fi
}

# --- tool installer helpers -----------------------------------------------
ensure_python_tool() {
  local py_cmd
  py_cmd="$(get_base_python)"
  if [[ -n "$py_cmd" ]]; then
    return 0
  fi

  info "Python 3 is missing. Attempting to install Python 3..."
  local pkg_mgr
  pkg_mgr="$(detect_pkg_mgr)"

  case "$pkg_mgr" in
    apt)
      run_with_timeout 30 sudo apt-get update -qq && sudo apt-get install -y -qq python3 python3-pip python3-venv || true
      ;;
    brew)
      run_with_timeout 60 brew install python || true
      ;;
    dnf)
      run_with_timeout 30 sudo dnf install -y python3 python3-pip || true
      ;;
    pacman)
      run_with_timeout 30 sudo pacman -S --noconfirm python python-pip || true
      ;;
    winget)
      run_with_timeout 30 winget install --quiet --accept-source-agreements --accept-package-agreements Python.Python.3.12 || true
      ;;
    *)
      warn "Automatic installation for Python 3 is not supported for package manager '$pkg_mgr'."
      ;;
  esac

  py_cmd="$(get_base_python)"
  [[ -n "$py_cmd" ]] || die "Python 3 is required. Please install Python 3 (3.12 recommended) and re-run ./run.sh."
}

ensure_uv_tool() {
  if command -v uv >/dev/null 2>&1 || command -v uv.exe >/dev/null 2>&1; then
    return 0
  fi

  info "uv package manager not found. Attempting auto-installation of uv..."
  local py_cmd
  py_cmd="$(get_base_python)"

  if [[ -n "$py_cmd" ]]; then
    info "Installing uv via pip..."
    "$py_cmd" -m pip install --upgrade uv >/dev/null 2>&1 || true
  fi

  if ! command -v uv >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
    info "Installing uv via official installer script..."
    run_with_timeout 30 curl -fsSL https://astral.sh/uv/install.sh | sh >/dev/null 2>&1 || true
    for p in "$HOME/.local/bin" "$HOME/.cargo/bin"; do
      add_to_path_if_dir "$p"
    done
  fi

  if command -v uv >/dev/null 2>&1 || command -v uv.exe >/dev/null 2>&1; then
    bold "  ✓ uv installed successfully"
  else
    warn "uv could not be installed automatically; falling back to standard venv/pip."
  fi
}

ensure_node_tool() {
  local node_cmd npm_cmd
  node_cmd="$(find_node_cmd)"
  npm_cmd="$(find_npm_cmd)"

  if [[ -n "$node_cmd" && -n "$npm_cmd" ]]; then
    return 0
  fi

  info "Node.js / npm not found. Attempting auto-installation..."
  local pkg_mgr
  pkg_mgr="$(detect_pkg_mgr)"

  case "$pkg_mgr" in
    apt)
      run_with_timeout 30 sudo apt-get update -qq && sudo apt-get install -y -qq nodejs npm || true
      ;;
    brew)
      run_with_timeout 60 brew install node || true
      ;;
    dnf)
      run_with_timeout 30 sudo dnf install -y nodejs npm || true
      ;;
    pacman)
      run_with_timeout 30 sudo pacman -S --noconfirm nodejs npm || true
      ;;
    winget)
      run_with_timeout 30 winget install --quiet --accept-source-agreements --accept-package-agreements OpenJS.NodeJS.LTS || true
      ;;
    *)
      warn "Package manager '$pkg_mgr' auto-install for Node.js is not supported."
      ;;
  esac

  node_cmd="$(find_node_cmd)"
  npm_cmd="$(find_npm_cmd)"

  if [[ -n "$node_cmd" && -n "$npm_cmd" ]]; then
    bold "  ✓ Node.js and npm detected ($node_cmd, $npm_cmd)"
  else
    warn "Node.js / npm missing. Tailwind CSS compilation will be skipped if static CSS exists."
  fi
}

# --- backend & frontend env installation ---------------------------------
ensure_backend_env() {
  ensure_python_tool
  ensure_uv_tool

  local py_cmd
  py_cmd="$(find_python_cmd backend)"

  if [[ -z "$py_cmd" || "$py_cmd" == "python3" || "$py_cmd" == "python" || "$py_cmd" == "py" ]]; then
    if [[ ! -d "$ROOT/backend/.venv" ]]; then
      info "creating backend/.venv environment..."
      if command -v uv >/dev/null 2>&1; then
        (cd "$ROOT/backend" && uv venv .venv >/dev/null 2>&1 || true)
      else
        local base_py
        base_py="$(get_base_python)"
        "$base_py" -m venv "$ROOT/backend/.venv"
      fi
      py_cmd="$(find_python_cmd backend)"
    fi
  fi

  [[ -n "$py_cmd" ]] || die "Python environment for backend could not be created."

  info "ensuring backend dependencies are installed..."
  if command -v uv >/dev/null 2>&1; then
    (cd "$ROOT/backend" && uv sync >/dev/null 2>&1 || uv pip install -e . >/dev/null 2>&1 || true)
  else
    "$py_cmd" -m pip install --upgrade pip >/dev/null 2>&1 || true
    "$py_cmd" -m pip install -e "$ROOT/backend" >/dev/null 2>&1 || \
    "$py_cmd" -m pip install uvicorn fastapi structlog asyncpg pydantic pydantic-settings sqlalchemy httpx alembic arq pyotp argon2-cffi pyjwt cryptography aioboto3 python-multipart orjson jsonschema python-magic pillow opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-sqlalchemy opentelemetry-instrumentation-redis opentelemetry-exporter-otlp prometheus-client >/dev/null 2>&1 || \
    die "Failed to install backend dependencies."
  fi

  echo "$py_cmd"
}

ensure_frontend_env() {
  ensure_python_tool

  local py_cmd
  py_cmd="$(find_python_cmd frontend_flask)"

  if [[ -z "$py_cmd" || "$py_cmd" == "python3" || "$py_cmd" == "python" || "$py_cmd" == "py" ]]; then
    if [[ ! -d "$ROOT/frontend_flask/.venv" ]]; then
      info "creating frontend_flask/.venv environment..."
      local base_py
      base_py="$(get_base_python)"
      if command -v uv >/dev/null 2>&1; then
        (cd "$ROOT/frontend_flask" && uv venv .venv >/dev/null 2>&1 || "$base_py" -m venv "$ROOT/frontend_flask/.venv")
      else
        "$base_py" -m venv "$ROOT/frontend_flask/.venv"
      fi
      py_cmd="$(find_python_cmd frontend_flask)"
    fi
  fi

  if [[ -z "$py_cmd" ]]; then
    py_cmd="$(find_python_cmd backend)"
  fi

  [[ -n "$py_cmd" ]] || die "Python environment for frontend could not be created."

  info "ensuring frontend Python dependencies are installed..."
  if command -v uv >/dev/null 2>&1; then
    (cd "$ROOT/frontend_flask" && uv pip install -r requirements.txt >/dev/null 2>&1 || true)
  else
    "$py_cmd" -m pip install -r "$ROOT/frontend_flask/requirements.txt" >/dev/null 2>&1 || \
    "$py_cmd" -m pip install flask flask-session flask-wtf httpx redis flask-babel gunicorn >/dev/null 2>&1 || \
    die "Failed to install frontend Python dependencies."
  fi

  echo "$py_cmd"
}

ensure_frontend_assets() {
  ensure_node_tool
  local npm_cmd
  npm_cmd="$(find_npm_cmd)"

  if [[ -n "$npm_cmd" ]]; then
    if [[ ! -d "$ROOT/frontend_flask/node_modules" ]]; then
      info "installing frontend Node modules..."
      (cd "$ROOT/frontend_flask" && "$npm_cmd" install --no-audit --no-fund)
    fi

    if [[ ! -s "$ROOT/frontend_flask/static/css/watiq.css" ]]; then
      info "compiling Tailwind CSS stylesheet..."
      (cd "$ROOT/frontend_flask" && "$npm_cmd" run build)
    fi
  else
    if [[ ! -s "$ROOT/frontend_flask/static/css/watiq.css" ]]; then
      warn "static/css/watiq.css missing and npm not available; UI styling may be unrendered."
    fi
  fi
}

# --- Docker & Compose helpers ---------------------------------------------
compose() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    die "Docker compose is not available."
  fi
}

has_docker() {
  command -v docker >/dev/null 2>&1 &&
    (docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1) &&
    docker info >/dev/null 2>&1
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed or not on PATH."
  (docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1) ||
    die "Docker Compose plugin missing (install docker-compose-plugin)."
  docker info >/dev/null 2>&1 ||
    die "Docker daemon is not reachable — start Docker Desktop / daemon and retry."
}

# --- first-run bootstrap --------------------------------------------------
bootstrap_env() {
  if [[ ! -f .env ]]; then
    info "no .env found — seeding it from .env.example"
    cp .env.example .env
  fi

  if grep -qE '^JWT_PRIVATE_KEY=.+' .env && grep -q -- '-----BEGIN' .env; then
    return 0
  fi

  warn ".env missing valid JWT_PRIVATE_KEY — generating DEV-ONLY keypair..."
  local py_cmd
  py_cmd="$(ensure_backend_env)"
  if command -v uv >/dev/null 2>&1; then
    uv run --project backend python ops/dev/gen_dev_keys.py
  elif [[ -n "$py_cmd" ]]; then
    "$py_cmd" ops/dev/gen_dev_keys.py
  else
    die "python/uv not available; dev keys could not be generated."
  fi
}

# --- master setup command -------------------------------------------------
install_all_dependencies() {
  bold "=== Watiq Environment & Dependency Setup ==="
  ensure_python_tool
  ensure_uv_tool
  ensure_node_tool

  bootstrap_env

  info "Setting up backend Python environment..."
  local backend_python
  backend_python="$(ensure_backend_env)"
  bold "  ✓ Backend environment ready ($backend_python)"

  info "Setting up frontend Python environment..."
  local frontend_python
  frontend_python="$(ensure_frontend_env)"
  bold "  ✓ Frontend environment ready ($frontend_python)"

  info "Setting up frontend Node.js assets..."
  ensure_frontend_assets
  bold "  ✓ Frontend assets & CSS ready"

  bold "=== Setup Complete! All tools and dependencies are installed. ==="
}

# --- health check wait helper ---------------------------------------------
wait_for() {
  local name="$1" url="$2" tries="${3:-60}" pid="${4:-}" n=0
  info "waiting for $name at $url"
  while (( n++ < tries )); do
    if curl -fsS --max-time 2 "$url/healthz" >/dev/null 2>&1; then
      bold "  ✓ $name is up"
      return 0
    fi
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      warn "$name process (PID $pid) terminated unexpectedly."
      if [[ -f "$LOG_DIR/watiq-api.log" ]]; then
        warn "--- Recent log output from $LOG_DIR/watiq-api.log ---"
        tail -n 25 "$LOG_DIR/watiq-api.log" >&2 || true
        warn "----------------------------------------------------"
      fi
      return 1
    fi
    sleep 2
  done
  warn "$name did not answer /healthz after $((tries * 2))s"
  if [[ -f "$LOG_DIR/watiq-api.log" ]]; then
    warn "--- Recent log output from $LOG_DIR/watiq-api.log ---"
    tail -n 25 "$LOG_DIR/watiq-api.log" >&2 || true
    warn "----------------------------------------------------"
  fi
  return 1
}

# --- server runner modes --------------------------------------------------
up_docker() {
  local build_flag=("$@")
  require_docker
  install_all_dependencies

  info "starting the full stack (postgres, redis, minio, api, frontend)"
  compose up -d "${build_flag[@]}"

  wait_for "API" "$API_URL" || true
  wait_for "frontend" "$FRONTEND_URL" || true

  echo
  bold "Watiq is running (Docker)"
  echo "  frontend  $FRONTEND_URL"
  echo "  API       $API_URL      (docs at $API_URL/docs)"
  echo
  echo "  logs      ./run.sh logs [api|frontend]"
  echo "  stop      ./run.sh stop"
}

up_local() {
  require_docker
  install_all_dependencies

  local watcher_pid=""
  cleanup() {
    [[ -n "${watcher_pid:-}" ]] && kill "${watcher_pid}" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  local frontend_python npm_cmd
  frontend_python="$(ensure_frontend_env)"
  npm_cmd="$(find_npm_cmd)"

  info "starting API and dependencies in Docker..."
  compose up -d api
  wait_for "API" "$API_URL" || die "The API did not respond; check './run.sh logs api'."

  if [[ -n "$npm_cmd" ]]; then
    info "watching static/src and templates for CSS changes..."
    (cd frontend_flask && "$npm_cmd" run watch >"$LOG_DIR/watiq-tailwind.log" 2>&1) &
    watcher_pid=$!
  else
    warn "npm not found — CSS hot reload disabled."
  fi

  echo
  bold "Frontend (native) → $FRONTEND_URL   API (docker) → $API_URL"
  echo "  Tailwind log: $LOG_DIR/watiq-tailwind.log"
  echo

  cd frontend_flask
  WATIQ_API_URL="$API_URL" ENV=dev DEBUG=true FLASK_DEBUG=1 "$frontend_python" app.py
}

up_native() {
  install_all_dependencies

  # If Docker is available, ensure postgres & redis containers are up so native API has DB
  if has_docker; then
    info "Docker is running — ensuring Postgres, Redis & MinIO containers are up..."
    compose up -d postgres redis session-store minio createbuckets roles-init >/dev/null 2>&1 || true
  else
    warn "Docker is not running. Ensure local Postgres and Redis are accessible according to .env."
  fi

  local watcher_pid=""
  local api_pid=""

  cleanup() {
    info "shutting down native processes..."
    [[ -n "${watcher_pid:-}" ]] && kill "${watcher_pid}" 2>/dev/null || true
    [[ -n "${api_pid:-}" ]] && kill "${api_pid}" 2>/dev/null || true
  }
  trap cleanup EXIT INT TERM

  local backend_python frontend_python npm_cmd
  backend_python="$(ensure_backend_env)"
  frontend_python="$(ensure_frontend_env)"
  npm_cmd="$(find_npm_cmd)"

  if [[ -n "$npm_cmd" ]]; then
    info "watching static/src and templates for CSS changes..."
    (cd frontend_flask && "$npm_cmd" run watch >"$LOG_DIR/watiq-tailwind.log" 2>&1) &
    watcher_pid=$!
  fi

  info "starting API server natively on port ${API_PORT}..."
  if command -v uv >/dev/null 2>&1; then
    (cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port "${API_PORT}" >"$LOG_DIR/watiq-api.log" 2>&1) &
    api_pid=$!
  else
    (cd backend && "$backend_python" -m uvicorn app.main:app --host 127.0.0.1 --port "${API_PORT}" >"$LOG_DIR/watiq-api.log" 2>&1) &
    api_pid=$!
  fi

  wait_for "API" "$API_URL" 60 "$api_pid" || die "The API failed to start; check $LOG_DIR/watiq-api.log"

  echo
  bold "Watiq is running natively"
  echo "  frontend  $FRONTEND_URL"
  echo "  API       $API_URL      (docs at $API_URL/docs)"
  echo "  API log:  $LOG_DIR/watiq-api.log"
  echo "  CSS log:  $LOG_DIR/watiq-tailwind.log"
  echo

  cd frontend_flask
  WATIQ_API_URL="$API_URL" ENV=dev DEBUG=true FLASK_DEBUG=1 "$frontend_python" app.py
}

# --- entrypoint -----------------------------------------------------------
case "${1:-up}" in
  up|"")
    if has_docker; then
      up_docker
    else
      warn "Docker / docker compose is not running — auto-falling back to native mode"
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
  setup|install|deps)
    install_all_dependencies
    ;;
  migrate)
    bootstrap_env
    if has_docker; then
      info "Running database migrations via Docker..."
      compose run --rm migrate
    else
      info "Running database migrations natively..."
      py_cmd="$(ensure_backend_env)"
      (cd backend && "$py_cmd" -m alembic upgrade head)
    fi
    ;;
  test)
    install_all_dependencies
    if has_docker; then
      info "Running backend pytest via Docker..."
      compose exec api pytest -q || compose run --rm api pytest -q
    else
      info "Running backend pytest natively..."
      py_cmd="$(ensure_backend_env)"
      (cd backend && "$py_cmd" -m pytest -q)
    fi
    ;;
  logs)
    if has_docker; then
      compose logs -f --tail=100 ${2:+"$2"}
    else
      info "Native log files:"
      info "  API log:      $LOG_DIR/watiq-api.log"
      info "  Tailwind log: $LOG_DIR/watiq-tailwind.log"
      if [[ -f "$LOG_DIR/watiq-api.log" ]]; then
        tail -f "$LOG_DIR/watiq-api.log"
      fi
    fi
    ;;
  status)
    if has_docker; then
      compose ps
    else
      info "Checking native process status:"
      if command -v pgrep >/dev/null 2>&1; then
        pgrep -fl "uvicorn\|app.py\|tailwind" || info "No native processes running."
      elif command -v tasklist >/dev/null 2>&1; then
        tasklist | grep -iE "python|node|uvicorn" || info "No native processes running."
      else
        info "Process inspection tool not available."
      fi
    fi
    ;;
  stop|down)
    if has_docker; then
      compose down
      bold "stopped Docker stack"
    fi
    info "stopping native processes..."
    if command -v pkill >/dev/null 2>&1; then
      pkill -f "uvicorn app.main:app" 2>/dev/null || true
      pkill -f "app.py" 2>/dev/null || true
    fi
    bold "stopped native processes"
    ;;
  reset)
    if has_docker; then
      warn "This deletes Postgres, MinIO and Redis volumes!"
      read -r -p "Type 'yes' to continue: " reply
      [[ "$reply" == "yes" ]] || die "aborted"
      compose down -v
      bold "Docker stack removed and volumes deleted."
    fi
    info "stopping native processes..."
    if command -v pkill >/dev/null 2>&1; then
      pkill -f "uvicorn app.main:app" 2>/dev/null || true
      pkill -f "app.py" 2>/dev/null || true
    fi
    bold "stopped native processes"
    ;;
  -h|--help|help)
    awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' \
      "${BASH_SOURCE[0]}"
    ;;
  *)
    die "Unknown command '$1' — try './run.sh --help'"
    ;;
esac
