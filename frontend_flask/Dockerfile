# Watiq frontend (BFF) image — multi-stage, non-root, read-only runtime.
# Mirrors the hardening of backend/Dockerfile (Security.md §12.4).
#
# Stage 1 compiles Tailwind. That step is why this image exists at all: the
# mockups loaded cdn.tailwindcss.com, which JIT-compiles CSS in the browser and
# is rejected by the production CSP (script-src 'self'). The compiled stylesheet
# is a static, same-origin asset.
#
# Base images pinned by digest — a tag is a moving pointer, so an unpinned
# rebuild can ship a base that was never scanned. Refresh with:
#   docker buildx imagetools inspect node:22-bookworm-slim
#   docker buildx imagetools inspect python:3.12-slim-bookworm

FROM node:22-bookworm-slim AS assets
WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY tailwind.config.js ./
COPY static/src ./static/src
COPY templates ./templates
RUN npx tailwindcss -i static/src/watiq.css -o static/css/watiq.css --minify


FROM python:3.12-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY requirements.txt ./
# Built at its FINAL path on purpose: console scripts (gunicorn) bake an
# absolute shebang naming the interpreter that created them, so building at
# /build/.venv and copying to /opt/watiq/.venv produces a gunicorn whose shebang
# points nowhere — failing at exec with "no such file or directory".
RUN python -m venv /opt/watiq/.venv \
 && /opt/watiq/.venv/bin/pip install -r requirements.txt


FROM python:3.12-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b
RUN groupadd -r watiq -g 10001 && \
    useradd -r -g watiq -u 10001 -s /usr/sbin/nologin watiq

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
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
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
