# Watiq API image — multi-stage, non-root, read-only runtime.
# Hardening rationale: Security.md §12.4. The app is code that must never
# change at runtime (Wazuh FIM watches /opt/watiq/app).
#
# Base images are pinned by digest, not tag: a tag is a moving pointer, so an
# unpinned rebuild can silently ship a different base than the one that was
# scanned. The digest is what Docker enforces; the tag in front of it is there
# so a human can see which release is pinned without resolving the hash.
#
# PIN THE INDEX DIGEST, NOT A PER-ARCHITECTURE ONE. A digest can name either a
# multi-platform index or one architecture's manifest, and they look identical
# in a FROM line. Pinning a per-arch digest still builds fine on the machine it
# was captured on and fails on every other with "no match for platform in
# manifest" — so verify the platform list before pinning, and read ALL of it:
#   docker buildx imagetools inspect python:3.12-slim-bookworm
#   docker buildx imagetools inspect ghcr.io/astral-sh/uv:latest   # note the version it reports
# Confirm BOTH linux/amd64 and linux/arm64 appear.
#
# Verified 2026-08-07 — python index: amd64, arm64/v8, arm/v7, 386, ppc64le;
# uv 0.12.1 index: amd64, arm64. Refreshed to the current 3.12 patch release.
FROM python:3.12-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2 AS builder
# UV_PROJECT_ENVIRONMENT puts the venv at its FINAL path during the build.
# Console scripts (alembic, gunicorn, arq) bake an absolute shebang pointing at
# the interpreter that created them, so a venv built at /build/.venv and then
# copied to /opt/watiq/.venv yields scripts whose shebang names a path that does
# not exist in the runtime image — the exec fails with the thoroughly
# misleading "no such file or directory".
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
  UV_PROJECT_ENVIRONMENT=/opt/watiq/.venv
COPY --from=ghcr.io/astral-sh/uv:0.12.1@sha256:cf4eedcaa81655197f625739489effcbe71b61ceb1506f332c3facae5deceded /uv /bin/uv
WORKDIR /build
COPY pyproject.toml uv.lock alembic.ini ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app ./app

FROM python:3.12-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2
# -m: create the home directory. Without it $HOME points at a path that does
# not exist, and gunicorn logs "Control server error: [Errno 13] Permission
# denied: '/home/watiq'" on every boot — a red ERROR line, on a working stack,
# that sends you looking for a fault that is not there.
RUN groupadd -r watiq -g 10001 && \
  useradd -r -g watiq -u 10001 -m -d /home/watiq -s /usr/sbin/nologin watiq && \
  apt-get update && apt-get install -y --no-install-recommends libmagic1 && \
  rm -rf /var/lib/apt/lists/*

# Root-owned, non-root-executed: the process cannot modify its own code.
COPY --from=builder --chown=root:root /opt/watiq/.venv /opt/watiq/.venv
COPY --from=builder --chown=root:root /build/app      /opt/watiq/app
COPY --from=builder --chown=root:root /build/alembic.ini /opt/watiq/alembic.ini

ENV PATH="/opt/watiq/.venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /opt/watiq
USER 10001:10001
EXPOSE 8000
# start-period matters here: `frontend` and `worker` both wait on this service
# being healthy, and without a grace window the three retries are spent while
# the app is still importing on a cold, slow, or emulated machine — the API is
# then marked unhealthy and everything downstream is blocked behind a service
# that was only ever slow to start.
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=60s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
ENTRYPOINT ["gunicorn","app.main:app","--worker-class","uvicorn.workers.UvicornWorker","--bind","0.0.0.0:8000"]
