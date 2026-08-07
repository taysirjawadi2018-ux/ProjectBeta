# Watiq frontend (BFF) image — multi-stage, non-root, read-only runtime.
# Mirrors the hardening of backend/Dockerfile (Security.md §12.4).
#
# Stage 1 compiles Tailwind. That step is why this image exists at all: the
# mockups loaded cdn.tailwindcss.com, which JIT-compiles CSS in the browser and
# is rejected by the production CSP (script-src 'self'). The compiled stylesheet
# is a static, same-origin asset.
#
# Base images pinned by digest — a tag is a moving pointer, so an unpinned
# rebuild can ship a base that was never scanned.
#
# node was not pinned at all here, so every rebuild could pull a different
# base. Pin the multi-platform INDEX digest, never a per-architecture one — see
# the longer note in backend/Dockerfile. Refresh with:
#   docker buildx imagetools inspect node:22-bookworm-slim
#   docker buildx imagetools inspect python:3.12-slim-bookworm
# and confirm BOTH linux/amd64 and linux/arm64 appear before pinning.
#
# Verified 2026-08-07 — node index: amd64, arm64/v8, arm/v7, ppc64le;
# python index: amd64, arm64/v8, arm/v7, 386, ppc64le.

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS assets
WORKDIR /build
# package-lock.json is required, not optional: `npm ci` refuses to run without
# it. The glob keeps the COPY from failing on a checkout that lacks the file,
# so fall back to `npm install` there rather than dying with a lockfile error
# that says nothing about what is actually missing.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else echo "warning: no package-lock.json, falling back to npm install" >&2; \
         npm install --no-audit --no-fund; fi
COPY tailwind.config.js ./
COPY static/src ./static/src
COPY templates ./templates
RUN npx tailwindcss -i static/src/watiq.css -o static/css/watiq.css --minify


FROM python:3.12-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2 AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY requirements.txt ./
# Built at its FINAL path on purpose: console scripts (gunicorn) bake an
# absolute shebang naming the interpreter that created them, so building at
# /build/.venv and copying to /opt/watiq/.venv produces a gunicorn whose shebang
# points nowhere — failing at exec with "no such file or directory".
RUN python -m venv /opt/watiq/.venv \
 && /opt/watiq/.venv/bin/pip install -r requirements.txt


FROM python:3.12-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2
# -m: create the home directory — see backend/Dockerfile. Without it gunicorn
# logs a Permission denied ERROR for $HOME on every boot of a healthy service.
RUN groupadd -r watiq -g 10001 && \
    useradd -r -g watiq -u 10001 -m -d /home/watiq -s /usr/sbin/nologin watiq

# Root-owned, non-root-executed: the process cannot rewrite its own code or
# templates at runtime (Wazuh FIM watches this tree).
COPY --from=builder --chown=root:root /opt/watiq/.venv /opt/watiq/.venv
COPY --chown=root:root app.py config.py api.py auth.py screens.py /opt/watiq/
COPY --chown=root:root views      /opt/watiq/views
COPY --chown=root:root templates  /opt/watiq/templates
COPY --chown=root:root static     /opt/watiq/static
# The built stylesheet overwrites any stale copy from the build context.
COPY --from=assets --chown=root:root /build/static/css/watiq.css /opt/watiq/static/css/watiq.css

ENV PATH="/opt/watiq/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /opt/watiq
USER 10001:10001
EXPOSE 5000
# Grace window before the retry budget starts — see backend/Dockerfile.
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=45s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5000/healthz')"

# gthread, not the default sync worker: nearly every request is blocked on an
# upstream API call, so threads keep a worker useful while it waits.
ENTRYPOINT ["gunicorn", "app:app", \
            "--bind", "0.0.0.0:5000", \
            "--workers", "2", \
            "--threads", "4", \
            "--worker-class", "gthread", \
            "--access-logfile", "-", \
            "--forwarded-allow-ips", "*"]
