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
# static/js is one of the two content globs in tailwind.config.js
# (["./templates/**/*.html", "./static/js/**/*.js"]). Leaving it out of this
# stage does not fail the build — it makes Tailwind scan a directory that is
# not there and silently purge every class used only from JavaScript.
COPY static/js ./static/js
# tools/ carries the second half of the stylesheet build. Only the two scripts
# that step needs, so the Python tooling in that directory stays out of the
# image.
COPY tools/scale-text.js tools/postcss-text-scale.js ./tools/

# `npm run build`, not a bare `tailwindcss` call.
#
# The build is TWO steps — see package.json:
#     tailwindcss ... --minify  &&  node tools/scale-text.js static/css/watiq.css
# and this stage used to run only the first. The second rewrites every
# `font-size: X` in the compiled sheet into `calc(X * var(--w-text-scale))`,
# which is the entire mechanism behind the text-size control: the .text-scale-125
# / .text-scale-150 classes set that variable and nothing else.
#
# Skipping it produces a stylesheet that looks correct and is missing the one
# thing that matters. The classes are all present, the toggle sets its cookie,
# the server renders the class onto <html> — and no text changes size, because
# no font-size in the sheet reads the variable those classes set.
#
# scale-text.js requires postcss, which is a transitive dependency of tailwindcss
# rather than a declared one. It is pinned in package-lock.json, so `npm ci`
# installs it deterministically; if the Tailwind major ever changes and drops it,
# this step fails loudly here rather than shipping an unscaled sheet.
RUN npm run build


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

# Compile the message catalogs here rather than trusting the .mo files in the
# build context. Flask-Babel reads only the compiled .mo; a .po edited without
# a `pybabel compile` leaves a stale or absent .mo, and the symptom is the
# language switcher appearing to do nothing — the locale and text direction
# change, every string stays English. Compiling as part of the build makes the
# committed .po the single source of truth.
COPY translations ./translations
RUN /opt/watiq/.venv/bin/pybabel compile -d translations -f \
 && echo "compiled catalogs:" && find translations -name '*.mo' -printf '  %p (%s bytes)\n'


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
# The compiled message catalogs. app.py sets BABEL_TRANSLATION_DIRECTORIES to
# the relative path "translations", which Flask-Babel resolves against the app
# root — /opt/watiq. This directory was simply never copied, so that lookup hit
# nothing, gettext fell back to the untranslated source strings, and picking
# French or Arabic changed the <html> lang/dir attributes and not one word of
# text. Taken from the builder stage so they are the freshly compiled ones.
COPY --from=builder --chown=root:root /build/translations /opt/watiq/translations
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
