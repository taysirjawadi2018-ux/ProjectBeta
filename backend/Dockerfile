# Watiq API image — multi-stage, non-root, read-only runtime.
# Hardening rationale: Security.md §12.4. The app is code that must never
# change at runtime (Wazuh FIM watches /opt/watiq/app).
#
# Base images are pinned by digest, not tag: a tag is a moving pointer, so an
# unpinned rebuild can silently ship a different base than the one that was
# scanned. The digest is what Docker enforces; the tag in front of it is there
# so a human can see which release is pinned without resolving the hash.
# Refresh these with:
#   docker buildx imagetools inspect python:3.12-slim-bookworm
#   docker buildx imagetools inspect ghcr.io/astral-sh/uv:latest   # note the version it reports
# Resolved 2026-08-04 (uv 0.12.1).
FROM python:3.12-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b AS builder
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

FROM python:3.12-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b
RUN groupadd -r watiq -g 10001 && \
  useradd -r -g watiq -u 10001 -s /usr/sbin/nologin watiq && \
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
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
ENTRYPOINT ["gunicorn","app.main:app","--worker-class","uvicorn.workers.UvicornWorker","--bind","0.0.0.0:8000"]
