# Watiq frontend (BFF) image — multi-stage, non-root, read-only runtime.
# Mirrors the hardening of backend/Dockerfile (Security.md §12.4).
#
# Base image pinned by digest — a tag is a moving pointer, so an unpinned
# rebuild can ship a base that was never scanned. Pin the multi-platform INDEX
# digest, never a per-architecture one; a per-arch digest builds on the machine
# that produced it and fails everywhere else with an unhelpful manifest error.
# Refresh with:
#   docker buildx imagetools inspect node:22-bookworm-slim
# and confirm BOTH linux/amd64 and linux/arm64 appear before pinning.
#
# Verified 2026-08-07 — node index: amd64, arm64/v8, arm/v7, ppc64le.

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS deps
WORKDIR /build
# package-lock.json is required, not optional: `npm ci` refuses to run without
# it. The glob keeps the COPY from failing on a checkout that lacks the file, so
# fall back to `npm install` there rather than dying with a lockfile error that
# says nothing about what is actually missing.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else echo "warning: no package-lock.json, falling back to npm install" >&2; \
         npm install --no-audit --no-fund; fi


FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS builder
WORKDIR /build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /build/node_modules ./node_modules
COPY . .

# `next build`, which runs the PostCSS chain in postcss.config.js.
#
# That chain is three steps, and the third is the one that matters:
#     tailwindcss  ->  autoprefixer  ->  tools/postcss-text-scale.js
# The last rewrites every `font-size: X` in the compiled sheet into
# `calc(X * var(--w-text-scale))`, which is the entire mechanism behind the
# text-size control: the .text-scale-125 / .text-scale-150 classes set that
# variable and nothing else.
#
# Dropping it produces a stylesheet that looks correct and is missing the one
# thing that matters. The classes are all present, the toggle sets its cookie,
# the server renders the class onto <html> — and no text changes size, because
# no font-size in the sheet reads the variable those classes set. So the build
# asserts it afterwards rather than trusting it: a silent regression here is
# invisible until someone who needs 150% text tries to use the portal.
RUN npm run build \
 && if ! grep -q 'var(--w-text-scale' .next/static/css/*.css; then \
      echo "FATAL: compiled CSS has no var(--w-text-scale) — the text-size control is dead" >&2; \
      exit 1; \
    fi \
 && echo "text-scale step verified in the compiled stylesheet"


FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436
# -m: create the home directory. Without it Node logs a permission error for
# $HOME on every boot of an otherwise healthy service.
RUN groupadd -r watiq -g 10001 && \
    useradd -r -g watiq -u 10001 -m -d /home/watiq -s /usr/sbin/nologin watiq

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

# Root-owned, non-root-executed: the process cannot rewrite its own code at
# runtime (Wazuh FIM watches this tree).
#
# `output: 'standalone'` in next.config.mjs traces exactly the dependencies the
# server needs, so node_modules is not copied wholesale — that is the difference
# between a ~200 MB image and a ~1 GB one, and every module left out is one that
# cannot be reached by anything that gets a foothold.
COPY --from=builder --chown=root:root /build/.next/standalone ./
COPY --from=builder --chown=root:root /build/.next/static ./.next/static
COPY --from=builder --chown=root:root /build/public ./public

# The cache directory Next writes at runtime. The container is read_only in
# production, so this has to be a tmpfs mount there (see docker-compose.prod.yml)
# — but the directory must EXIST and be writable by uid 10001 either way, or the
# server exits on its first render with EACCES.
RUN mkdir -p /app/.next/cache && chown -R 10001:10001 /app/.next/cache

USER 10001:10001
EXPOSE 3000

# Grace window before the retry budget starts: a cold Node process plus the
# first render is slower than the interval, and without it the orchestrator
# kills a container that was only starting up.
#
# /healthz, not /readyz: this is liveness. A readiness probe that fails when
# Redis or the API is down would get this container restarted for someone
# else's outage.
HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=45s \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server.js is what `output: 'standalone'` emits. Not `next start`, which needs
# the full next package and the whole node_modules tree this image deliberately
# does not carry.
ENTRYPOINT ["node", "server.js"]
