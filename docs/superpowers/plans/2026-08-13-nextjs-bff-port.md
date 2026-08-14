# Next.js BFF Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Watiq Flask BFF (`frontend_flask/`) to the Next.js App Router frontend (`watiq_nextjs_frontend/`) with identical routes, guards, security properties and screens, then delete `frontend_flask/` and rewire every piece of infrastructure that references it.

**Architecture:** Next.js 15 App Router used strictly as a back-end-for-frontend, not an SPA. Every API call happens in a Server Component or Server Action against `http://api:8000`; the access token lives in a Redis-backed server session keyed by an opaque `wtq_session` httpOnly cookie and never reaches the browser (ADR-005). Forms are `<form action={serverAction}>` so they progressively enhance and still work with JavaScript disabled, exactly as the Jinja forms did. The design system (tokens, fonts, Tailwind config, per-page CSS) transfers verbatim from `frontend_flask/static/src/` — it has already been copied into `watiq_nextjs_frontend/styles/`.

**Tech Stack:** Next.js 15 (App Router, RSC, Server Actions), React 19, Tailwind CSS 3.4 (**not** v4 — see Global Constraints), `ioredis`, `next-intl`, Vitest + MSW, Playwright (smoke only).

**Spec:** The Flask application itself is the spec. Specifically:
- Routes & control flow: `frontend_flask/views/{public,citizen,staff,admin}.py`
- BFF contract & session rules: `frontend_flask/api.py`, `frontend_flask/auth.py`, `frontend_flask/config.py`
- Cross-cutting behaviour (locale, theme, errors, context globals): `frontend_flask/app.py`
- Markup: `frontend_flask/templates/**/*.html`
- Behavioural acceptance criteria: `frontend_flask/tests/**` — **this is the authoritative route inventory**
- Security envelope: `Security.md`, `Architecture.md` (ADR-003, ADR-005), `ops/nginx/`

---

## Global Constraints

Every task's requirements implicitly include this section.

1. **The access token never reaches the browser.** No token in `localStorage`, `sessionStorage`, a readable cookie, an RSC payload, or a client component prop. ADR-005. Any task that would serialize a token into client-visible output is wrong.
2. **No citizen PII in Redis.** The session record holds exactly: `access_token`, `refresh_token`, `role`, `is_staff`, `mfa_required`, `csrf_token`. No name, national_id, email, phone, address. Backend.md §7, ADR-003. Profile data is fetched per request and discarded.
3. **Tailwind CSS 3.4.17**, matching `frontend_flask/package.json`. The existing `tailwind.config.js` is v3 syntax and the token pipeline depends on it. The `tailwindcss: ^4.3.3` and `@tailwindcss/postcss` entries currently in `watiq_nextjs_frontend/package.json` are wrong and get removed in Task 1.
4. **Every asset is same-origin.** The production CSP is `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'` (`ops/nginx/snippets/security-headers.conf:20`). No `fonts.googleapis.com`, no `cdn.tailwindcss.com`, no CDN of any kind. The Google Fonts `<link>` currently in `app/layout.js` violates this and is removed in Task 2.
5. **Three locales**: `en` (source language and fallback), `fr`, `ar`. Arabic is RTL; direction is set via `dir` on `<html>` and drives the logical Tailwind utilities (`ms-/me-/start-/end-`). There is no separate RTL stylesheet.
6. **Theme and text scale are server-rendered from cookies**, never applied by an inline script. Cookies: `watiq_theme` (`light`|`dark`), `watiq_text_scale` (`100`|`125`|`150`), `watiq_lang` (`en`|`fr`|`ar`). Unrecognised values are discarded, not escaped.
7. **The text-scale mechanism is load-bearing and easy to silently drop.** `tools/postcss-text-scale.js` rewrites every `font-size: X` into `calc(X * var(--w-text-scale))`. Without it the classes render, the cookie sets, and no text changes size. It must be wired into `postcss.config.js` (Task 2).
8. **404, not 403, for unauthorized staff routes.** A citizen must not learn a staff route exists. `frontend_flask/auth.py:staff_required`. Likewise the API's BOLA responses stay opaque — never echo the API's own 404 detail to a citizen (`api.py:user_message`).
9. **Failure is per-panel on dashboards.** The `try_get` pattern: one dead widget must not blank the page. Detail pages use the throwing variant.
10. **Node 22**, pinned by multi-arch index digest in the Dockerfile, matching the convention in `frontend_flask/Dockerfile` and `backend/Dockerfile`.
11. Runtime user `10001:10001`, read-only root filesystem, port **3000**.

---

## File Structure

```
watiq_nextjs_frontend/
  next.config.mjs              # standalone output, CSP nonce plumbing
  postcss.config.js            # tailwind + tools/postcss-text-scale.js
  tailwind.config.js           # EXISTS — content globs updated for app/ & components/
  middleware.js                # per-request CSP nonce
  Dockerfile                   # multi-stage, non-root, :3000
  .dockerignore
  vitest.config.js

  lib/
    api.js                     # port of frontend_flask/api.py
    session.js                 # Redis session store, opaque cookie
    auth.js                    # port of frontend_flask/auth.py
    guards.js                  # requireLogin / requireStaff / requireAdmin
    csrf.js                    # double-submit token issue + verify
    errors.js                  # ApiError -> error screen mapping
    prefs.js                   # locale / theme / text-scale cookie reads
    flash.js                   # one-shot messages in the session
    format.js                  # display_name, items_of, total_of

  i18n/
    request.js                 # next-intl per-request config
    messages/{en,fr,ar}.json   # converted from translations/*.po

  app/
    layout.js                  # port of templates/base.html
    error.js  not-found.js  blocked/page.js
    (public)/…  (citizen)/…  staff/…  admin/…
    api/preferences/route.js
    documents/[id]/download/route.js
    healthz/route.js  readyz/route.js

  components/                  # Navbar, Footer, Logo, A11yControls EXIST
    …plus per-screen components ported from templates/

  styles/                      # EXISTS — verbatim from flask static/src
  public/                      # EXISTS — fonts, img, favicons, webmanifest
  tests/                       # port of frontend_flask/tests/
```

---

# Phase 0 — Foundation

### Task 1: Correct the dependency set and Next.js config

**Files:**
- Modify: `watiq_nextjs_frontend/package.json`
- Create: `watiq_nextjs_frontend/next.config.mjs`
- Create: `watiq_nextjs_frontend/.gitignore`

**Interfaces:**
- Produces: a buildable Next.js project on Tailwind 3.4.17 with `output: 'standalone'`.

- [x] **Step 1: Replace `package.json`**

```json
{
  "name": "watiq-nextjs",
  "version": "1.0.0",
  "private": true,
  "description": "Watiq National Portal — Next.js back-end-for-frontend. Replaces frontend_flask.",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ioredis": "^5.4.1",
    "next": "^15.1.7",
    "next-intl": "^3.26.3",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/container-queries": "^0.1.1",
    "@tailwindcss/forms": "^0.5.9",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "eslint": "^9",
    "eslint-config-next": "^15.1.7",
    "msw": "^2.7.0",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vitest": "^2.1.8"
  }
}
```

Note what left: `lucide-react` (the ported templates use Material Symbols glyphs, not Lucide), `uri-js` (not used), `tailwindcss@4` + `@tailwindcss/postcss` (Constraint 3).

- [x] **Step 2: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Dockerfile copies .next/standalone; without this the runtime stage
  // would need the full node_modules tree.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // The BFF renders per-request (session, locale, theme all come from cookies),
  // so nothing here is statically prerenderable. Being explicit stops a build
  // from silently caching a signed-in page.
  experimental: { staleTimes: { dynamic: 0, static: 0 } },
};

export default nextConfig;
```

- [x] **Step 3: Create `.gitignore`**

```
node_modules/
.next/
out/
.env*.local
*.tsbuildinfo
```

- [x] **Step 4: Install and verify the build runs**

Run: `cd watiq_nextjs_frontend && npm install --no-audit --no-fund && npm run build`
Expected: build completes. It may warn about the missing PostCSS config — Task 2 fixes that.

- [x] **Step 5: Commit**

```bash
git add watiq_nextjs_frontend/package.json watiq_nextjs_frontend/package-lock.json \
        watiq_nextjs_frontend/next.config.mjs watiq_nextjs_frontend/.gitignore
git commit -m "build(frontend): pin next.js BFF dependency set on tailwind 3.4"
```

---

### Task 2: Wire the stylesheet pipeline, including the text-scale step

**Files:**
- Create: `watiq_nextjs_frontend/postcss.config.js`
- Copy: `frontend_flask/tools/postcss-text-scale.js` → `watiq_nextjs_frontend/tools/postcss-text-scale.js`
- Modify: `watiq_nextjs_frontend/tailwind.config.js` (content globs)
- Modify: `watiq_nextjs_frontend/app/globals.css`
- Modify: `watiq_nextjs_frontend/app/layout.js` (drop the Google Fonts link)

**Interfaces:**
- Produces: a compiled same-origin stylesheet where every `font-size` reads `var(--w-text-scale)`.

- [x] **Step 1: Copy the PostCSS plugin**

```bash
mkdir -p watiq_nextjs_frontend/tools
cp frontend_flask/tools/postcss-text-scale.js watiq_nextjs_frontend/tools/
```

- [x] **Step 2: Create `postcss.config.js`**

```js
// The text-scale plugin MUST run after tailwindcss, so it sees the generated
// utilities' font-size declarations and not just the ones written by hand.
// See Global Constraint 7 — dropping it produces a stylesheet that looks
// correct and silently disables the entire text-size control.
module.exports = {
  plugins: [
    require('tailwindcss'),
    require('autoprefixer'),
    require('./tools/postcss-text-scale.js'),
  ],
};
```

- [x] **Step 3: Update the Tailwind content globs**

In `tailwind.config.js`, replace the `content` array with:

```js
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
```

Leave `theme`, `plugins` and `darkMode: 'class'` exactly as they are — they carry the design tokens.

- [x] **Step 4: Fix `app/globals.css`**

Replace the first two lines (`@import "../styles/watiq.css";` / `@tailwind utilities;`) with the full v3 directive set, keeping the rest of the file:

```css
@import "../styles/_fonts.css";
@import "../styles/_tokens.css";
@import "../styles/_theme.css";

@tailwind base;
@tailwind components;
@tailwind utilities;
```

`_theme.css` stays imported last of the three — it rebinds the same variables for dark mode and only beats the per-page `.tk-*` overrides by source order.

- [x] **Step 5: Remove the CSP-violating font link**

In `app/layout.js`, delete the entire `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` element. The Material Symbols glyphs are already served from `public/fonts/material-symbols-outlined.woff2` via `_fonts.css`.

- [x] **Step 6: Verify the pipeline**

Run: `cd watiq_nextjs_frontend && npm run build && grep -c "var(--w-text-scale)" .next/static/css/*.css`
Expected: a non-zero count. Zero means the plugin did not run — do not proceed.

- [x] **Step 7: Commit**

```bash
git add watiq_nextjs_frontend/postcss.config.js watiq_nextjs_frontend/tools/ \
        watiq_nextjs_frontend/tailwind.config.js watiq_nextjs_frontend/app/globals.css \
        watiq_nextjs_frontend/app/layout.js
git commit -m "build(frontend): compile design tokens with the text-scale postcss step"
```

---

### Task 3: CSP nonce middleware

**Files:**
- Create: `watiq_nextjs_frontend/middleware.js`
- Modify: `ops/nginx/snippets/security-headers.conf`

**Interfaces:**
- Produces: an `x-nonce` request header readable from `headers()` in any Server Component.

**Why this task exists:** Next.js emits inline `<script>` tags for hydration and the RSC payload. The current CSP is `script-src 'self'` with no `'unsafe-inline'` and no nonce, so **the app will render a blank page behind nginx** without this. Flask had no inline scripts, so this problem is new.

- [x] **Step 1: Create `middleware.js`**

```js
import { NextResponse } from 'next/server';

// Next.js inlines the RSC payload and the hydration bootstrap as <script>
// blocks. Under `script-src 'self'` those are refused and the page never
// hydrates, so each response carries a fresh nonce that both the CSP and
// Next's own script tags use. Next reads the nonce off the `x-nonce` request
// header automatically when it renders those tags.
export function middleware(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own static output and the vendored assets —
    // those are same-origin files with no inline script to protect.
    { source: '/((?!_next/static|_next/image|img|fonts|favicon.ico).*)' },
  ],
};
```

- [x] **Step 2: Stop nginx from setting a conflicting CSP**

In `ops/nginx/snippets/security-headers.conf`, replace the `Content-Security-Policy` line (line 20) with a comment explaining the move, keeping every other header untouched:

```nginx
# Content-Security-Policy is set per-response by the frontend, not here.
# Next.js emits inline hydration scripts that need a per-request nonce, and a
# static header cannot carry one. See watiq_nextjs_frontend/middleware.js.
# Two CSP headers are intersected by the browser, so leaving this one in place
# would reimpose `script-src 'self'` and break hydration no matter what the
# app sends.
```

- [x] **Step 3: Verify both header sets**

Run: `cd watiq_nextjs_frontend && npm run build && npm start &` then `curl -sI localhost:3000/ | grep -i content-security-policy`
Expected: one CSP header containing `'nonce-` .

- [x] **Step 4: Commit**

```bash
git add watiq_nextjs_frontend/middleware.js ops/nginx/snippets/security-headers.conf
git commit -m "feat(frontend): per-request CSP nonce for next.js hydration scripts"
```

---

### Task 4: Test harness

**Files:**
- Create: `watiq_nextjs_frontend/vitest.config.js`
- Create: `watiq_nextjs_frontend/tests/fixtures.js`
- Create: `watiq_nextjs_frontend/tests/setup.js`

**Interfaces:**
- Produces: `FIXTURES`, `SENT`, `server` (MSW), and the `citizenSession()` / `adminSession()` helpers every later test uses.

This is the direct analogue of `frontend_flask/tests/conftest.py`: the API is stubbed at the HTTP boundary so tests exercise the real client, the real session handling and the real components — everything except the network hop.

- [x] **Step 1: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
```

- [x] **Step 2: Port the fixtures**

Create `tests/fixtures.js` by transcribing the `FIXTURES` dict from `frontend_flask/tests/conftest.py:28-200` into a JS object with the identical keys (`"GET /api/v1/auth/me"` etc.) and identical payloads. Do not paraphrase the payloads — the comments in that file record which field names the API actually uses (`unread_count` not `count`; `role_code`; office_service `id` vs `catalog_id`), and those distinctions are what the contract tests catch.

- [x] **Step 3: Create `tests/setup.js`**

```js
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { FIXTURES } from './fixtures.js';

// Every call the BFF makes, so a test can assert on the payload it SENT and
// not just on the page it rendered. Several Flask write paths were posting
// fields the API does not accept, which no render-only test can see.
export const SENT = [];

const handler = async ({ request }) => {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;
  let body = null;
  const raw = await request.clone().text();
  if (raw) { try { body = JSON.parse(raw); } catch { body = raw; } }

  SENT.push({
    method: request.method,
    path: url.pathname,
    params: Object.fromEntries(url.searchParams),
    json: body,
  });

  if (key in FIXTURES) return HttpResponse.json(FIXTURES[key]);
  if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return HttpResponse.json({ id: 11, tracking_code: 'WTQ-2026-000011' });
  }
  return HttpResponse.json(
    { type: 'about:blank', title: 'not_found', status: 404, detail: 'No such resource.' },
    { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
  );
};

export const server = setupServer(http.all('http://api:8000/*', handler));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); SENT.length = 0; });
afterAll(() => server.close());
```

- [x] **Step 4: Verify the harness boots**

Write `tests/harness.test.js`:

```js
import { expect, test } from 'vitest';
import { SENT } from './setup.js';

test('msw intercepts and records', async () => {
  const resp = await fetch('http://api:8000/api/v1/auth/me');
  expect(await resp.json()).toMatchObject({ first_name: 'Amal' });
  expect(SENT.at(-1)).toMatchObject({ method: 'GET', path: '/api/v1/auth/me' });
});
```

Run: `npm test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add watiq_nextjs_frontend/vitest.config.js watiq_nextjs_frontend/tests/
git commit -m "test(frontend): msw-backed harness mirroring the flask conftest"
```

---

## Phase 0 — as built (2026-08-14)

Complete. `6a38b07`, `2119ca3`, `acfa20e`, `f2e2361`, `9bcb402`.

Where the result differs from the steps above, and why:

1. **`app/globals.css` only imports `styles/watiq.css`** rather than repeating
   the `@tailwind` directives. `watiq.css` was already the complete v3 source —
   the `_fonts`/`_tokens`/`_theme` imports, all three layers, the Material
   Symbols base layer and the focus ring. Following Step 4 literally would have
   emitted the whole utility layer twice and re-declared
   `.material-symbols-outlined` outside `@layer base`.

2. **`postcss.config.js` names plugins as strings.** Next.js rejects
   `require()`d instances with "Malformed PostCSS Configuration".

3. **The text-scale verification initially reported a false negative.** The
   first `npm run build` after adding the plugin reused a webpack filesystem
   cache from a build that predated `postcss.config.js`, so the emitted CSS had
   no `calc()` at all. `rm -rf .next` before verifying a PostCSS change; the
   check is only meaningful on a cold build.

4. **`middleware.js` sets the CSP on the forwarded REQUEST headers too**, not
   only `x-nonce` and the response. Next extracts the nonce for its own script
   tags by parsing the request CSP; `x-nonce` alone yields a correct-looking
   response header and zero nonced scripts.

5. **`export const dynamic = 'force-dynamic'` in the root layout.** Not in the
   plan, and load-bearing: a statically prerendered page keeps build-time HTML
   whose scripts predate the nonce, so the browser refuses all of them.
   Measured before the fix — `/` and `/terms` shipped 0 of 16 tags nonced while
   the dynamic `/documents/[id]` shipped 16 of 16. All 22 routes now build as
   `ƒ`. Anything that reintroduces static rendering reintroduces a blank page.

6. **nginx keeps a CSP for the API instead of dropping the header.** Step 2
   would have left `/api/` uncovered. A `map` on
   `$upstream_http_content_security_policy` resolves to the static policy when
   the upstream sent none and to the empty string when it did (nginx skips
   `add_header` on an empty value), so each response carries exactly one CSP.
   Verified against a stock nginx with stub upstreams.

7. **The root `package.json` had to be repaired first** (`f2e2361`). It was a
   `#`-commented "DEPS Module" placeholder, i.e. not JSON, and esbuild parses
   the nearest ancestor `package.json` before loading any config — so
   `npm test` could not start from anywhere in the repo. `"type": "commonjs"`
   in the frontend package does not stop the walk-up; the file itself had to
   become valid JSON. Content preserved line for line under `deps-log`.

8. **`vitest.config.js` pins `css: { postcss: {} }`.** Vite rejects the plugin
   names Next requires and Next rejects the instances Vite wants, so one
   `postcss.config.js` cannot serve both. The tests compile no CSS.

9. **The session helpers named in Task 4's Interfaces (`citizenSession()` /
   `adminSession()`) are deferred to Task 5**, where `lib/session.js` lands.
   They cannot be written against a session store that does not exist yet.

### Still blocking Task 11: route path reconciliation

Now measurable on both sides. Flask exposes ~58 browser routes; the mockup
builds 22, under names it invented:

| Flask (tests + nginx rate-limit rules key on these) | Mockup as built |
| --- | --- |
| `/requests/new` | `/requests/submit` |
| `/login/mfa` | `/mfa` |
| `/staff` | `/staff/workbench` |
| `/staff/review/<id>` | `/staff/verify/[id]` |
| `/help` | `/faq` |
| `/legal/terms` | `/terms` |
| `/contact` | `/support` |
| `/requests/<id>/documents/new` | `/documents/upload` |

Default assumption unless told otherwise: **keep Flask's paths and move the
mockup files.** `ops/nginx/conf.d/watiq.conf` pins `location = /login` to the
`login` rate-limit zone by exact path, and the whole ported test suite keys on
the Flask inventory.

---

# Phase 1 — BFF core

### Task 5: Redis-backed session store

**Files:**
- Create: `watiq_nextjs_frontend/lib/session.js`
- Test: `watiq_nextjs_frontend/tests/session.test.js`

**Interfaces:**
- Produces:
  - `getSession(): Promise<Session>` — reads `wtq_session`, returns `{}` when absent
  - `setSession(patch: object): Promise<void>` — merges and persists, issuing the cookie on first write
  - `clearSession(): Promise<void>` — deletes the Redis key and expires the cookie
  - `Session` keys: `access_token`, `refresh_token`, `role`, `is_staff`, `mfa_required`, `csrf_token`, `flash`

Port of `frontend_flask/config.py:26-46` + Flask-Session. Cookie name `wtq_session`, Redis prefix `wtq:fe:sess:` — **keep both identical to Flask** so an in-flight deployment does not have to invalidate live sessions.

- [x] **Step 1: Write the failing test**

```js
import { expect, test } from 'vitest';
import { getSession, setSession, clearSession } from '@/lib/session.js';

test('a session round-trips without exposing tokens to the cookie', async () => {
  await setSession({ access_token: 'tok', is_staff: false, role: 'citizen' });
  expect(await getSession()).toMatchObject({ access_token: 'tok', role: 'citizen' });

  const { cookies } = await import('next/headers');
  const jar = await cookies();
  expect(jar.get('wtq_session').value).not.toContain('tok');
  expect(jar.get('wtq_session').httpOnly).toBe(true);

  await clearSession();
  expect(await getSession()).toEqual({});
});
```

- [x] **Step 2: Run it and confirm it fails**

Run: `npm test -- session`
Expected: FAIL — cannot resolve `@/lib/session.js`.

- [x] **Step 3: Implement**

```js
import 'server-only';
import { cookies } from 'next/headers';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

const COOKIE = 'wtq_session';
const PREFIX = 'wtq:fe:sess:';
const TTL_SECONDS = 60 * 60 * 8;

let client;

function redis() {
  if (client) return client;
  const dsn = process.env.REDIS_DSN || 'redis://127.0.0.1:6379/1';
  client = new Redis(dsn, { lazyConnect: false, maxRetriesPerRequest: 2 });
  return client;
}

// Outside dev, a missing Redis must be a hard failure rather than a silent
// downgrade to a cookie-backed session: that would put the access token in the
// browser, which is the exact thing the BFF exists to prevent.
export async function assertStoreReachable() {
  try {
    await redis().ping();
  } catch (err) {
    if (process.env.ENV !== 'dev') {
      throw new Error(`Redis is required for server-side sessions outside dev: ${err.message}`);
    }
    throw err;
  }
}

export async function getSession() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return {};
  try {
    const raw = await redis().get(PREFIX + id);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function setSession(patch) {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id) {
    id = randomUUID();
    jar.set(COOKIE, id, {
      httpOnly: true,
      // Lax rather than Strict: Strict drops the cookie on a top-level
      // navigation back from an external payment gateway, silently logging the
      // citizen out mid-transaction.
      sameSite: 'lax',
      secure: process.env.ENV !== 'dev',
      path: '/',
      maxAge: TTL_SECONDS,
    });
  }
  const merged = { ...(await getSession()), ...patch };
  await redis().set(PREFIX + id, JSON.stringify(merged), 'EX', TTL_SECONDS);
}

export async function clearSession() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await redis().del(PREFIX + id).catch(() => {});
  jar.delete(COOKIE);
}
```

- [x] **Step 4: Run the test**

Run: `npm test -- session`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add watiq_nextjs_frontend/lib/session.js watiq_nextjs_frontend/tests/session.test.js
git commit -m "feat(frontend): redis-backed server session, opaque cookie only"
```

---

### Task 6: API client

**Files:**
- Create: `watiq_nextjs_frontend/lib/api.js`
- Create: `watiq_nextjs_frontend/lib/format.js`
- Test: `watiq_nextjs_frontend/tests/api.test.js`

**Interfaces:**
- Consumes: `getSession`, `setSession` (Task 5)
- Produces:
  - `apiGet/apiPost/apiPatch/apiDelete(path, opts) -> Promise<any>`
  - `tryGet(path, fallback, opts) -> Promise<any>` — never throws
  - `ApiError` with `.status`, `.title`, `.detail`, `.body`, `.isAuth`, `.userMessage()`
  - `REFRESH_COOKIE = '__Host-wtq_rt'`, `captureRefreshCookie(response)`
  - from `format.js`: `itemsOf(data) -> any[]`, `totalOf(data, fallback) -> number`, `displayName(profile) -> string`

Port of `frontend_flask/api.py`. **Three details are load-bearing and must survive the port:**

1. The refresh cookie is replayed by hand. The API sets `__Host-wtq_rt` with `Secure` and reads it only from `request.cookies`. Over the plaintext in-cluster hop (`http://api:8000`) any cookie jar discards a Secure cookie outright, so the value is captured from `Set-Cookie` and sent back as an explicit `Cookie` header. Do not "simplify" this into a fetch cookie jar.
2. `userMessage()` returns generic copy per status. 404 in particular must stay opaque — Security.md §7.3 makes BOLA return 404 rather than 403 precisely so it is not an existence oracle, and echoing the API's detail would hand that back.
3. `itemsOf` normalises bare lists and `{items,total}` envelopes. The API returns both shapes; a component that iterates the wrong one fails obscurely on a page that merely had no data.

- [x] **Step 1: Write the failing tests**

```js
import { expect, test } from 'vitest';
import { apiGet, ApiError } from '@/lib/api.js';
import { itemsOf, totalOf, displayName } from '@/lib/format.js';
import { SENT } from './setup.js';

test('sends a bearer token from the session and never in the URL', async () => {
  const me = await apiGet('/api/v1/auth/me');
  expect(me.first_name).toBe('Amal');
  expect(SENT.at(-1).path).toBe('/api/v1/auth/me');
});

test('404 does not leak the API detail to the citizen', async () => {
  await expect(apiGet('/api/v1/requests/999')).rejects.toThrow(ApiError);
  try { await apiGet('/api/v1/requests/999'); }
  catch (e) { expect(e.userMessage()).toBe('Not found.'); }
});

test('itemsOf normalises both collection shapes', () => {
  expect(itemsOf([1, 2])).toEqual([1, 2]);
  expect(itemsOf({ items: [1], total: 1 })).toEqual([1]);
  expect(itemsOf({ nope: true })).toEqual([]);
  expect(totalOf({ items: [1], total: 7 })).toBe(7);
  expect(totalOf([1, 2])).toBe(2);
});

test('displayName resolves both profile shapes', () => {
  expect(displayName({ name: 'Karim Trabelsi' })).toBe('Karim Trabelsi');
  expect(displayName({ first_name: 'Amal', last_name: 'Ben Salah' })).toBe('Amal Ben Salah');
  expect(displayName(null)).toBe('');
});
```

- [x] **Step 2: Run and confirm failure**

Run: `npm test -- api`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `lib/format.js`**

```js
// The two /me endpoints disagree: GET /auth/me returns first_name/last_name,
// GET /staff/me returns a single `name` column. Components that greet the
// signed-in person render for both, so resolve it once here.
export function displayName(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const name = (profile.name || '').trim();
  if (name) return name;
  return [profile.first_name, profile.last_name]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ');
}

// The API returns bare lists from some endpoints (catalog/services,
// appointments/office) and {items,total} envelopes from the paginated ones.
export function itemsOf(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Array.isArray(data.items) ? data.items : [];
  return [];
}

export function totalOf(data, fallback = 0) {
  if (data && typeof data === 'object' && typeof data.total === 'number') return data.total;
  if (Array.isArray(data)) return data.length;
  return fallback;
}
```

- [x] **Step 4: Implement `lib/api.js`**

```js
import 'server-only';
import { headers } from 'next/headers';
import { getSession, setSession } from './session.js';

export const REFRESH_COOKIE = '__Host-wtq_rt';

const BASE = (process.env.WATIQ_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.WATIQ_API_TIMEOUT || 10) * 1000;

export class ApiError extends Error {
  constructor(status, title = '', detail = '', body = null) {
    super(`${status} ${title}`);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.body = body;
  }

  get isAuth() {
    return this.status === 401 || this.status === 403;
  }

  // What is safe to show a citizen. The API's own messages are written for
  // operators and can be specific enough to confirm a record exists.
  userMessage() {
    return {
      400: 'That request could not be processed. Please check the form and try again.',
      401: 'Your session has expired. Please sign in again.',
      403: 'You do not have permission to do that.',
      404: 'Not found.',
      409: 'That action conflicts with the current state of the record.',
      422: this.detail || 'Some of the information provided is not valid.',
      429: 'Too many attempts. Please wait a moment and try again.',
      503: 'The service is temporarily unavailable. Please try again shortly.',
    }[this.status] || 'Something went wrong. Please try again.';
  }
}

export async function captureRefreshCookie(response) {
  const raws = response.headers.getSetCookie?.() ?? [];
  for (const raw of raws) {
    if (raw.startsWith(`${REFRESH_COOKIE}=`)) {
      await setSession({ refresh_token: raw.split(';', 1)[0].split('=').slice(1).join('=') });
      return;
    }
  }
}

async function buildHeaders(auth, extra) {
  const h = { Accept: 'application/json' };
  if (auth) {
    const { access_token: token } = await getSession();
    if (token) h.Authorization = `Bearer ${token}`;
  }
  // Propagated so one citizen action is greppable end to end.
  const rid = (await headers()).get('x-request-id');
  if (rid) h['X-Request-ID'] = rid;
  return { ...h, ...(extra || {}) };
}

async function parse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function raise(status, body, path) {
  let title = '';
  let detail = '';
  if (body && typeof body === 'object') {
    title = String(body.title ?? '');
    detail = String(body.detail ?? '');
    // 422 from FastAPI validation arrives as {"detail": [ ... ]}
    if (Array.isArray(body.detail)) {
      detail = body.detail
        .map((e) => `${(e.loc || []).slice(1).join('.')}: ${e.msg || ''}`)
        .filter((p) => p.replace(/[:\s]/g, ''))
        .join('; ');
    }
  }
  console.warn('api_error', { status, path });
  throw new ApiError(status, title, detail, body);
}

export async function apiRequest(method, path, opts = {}) {
  const { auth = true, retryAuth = true, headers: extra, params, json, body, ...rest } = opts;

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const send = async () => fetch(url, {
    method,
    headers: {
      ...(await buildHeaders(auth, extra)),
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: json !== undefined ? JSON.stringify(json) : body,
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...rest,
  });

  let response = await send();

  if (response.status === 401 && auth && retryAuth) {
    const { refreshSession } = await import('./auth.js');
    if (await refreshSession()) response = await send();
  }

  const parsed = await parse(response);
  if (response.status >= 400) raise(response.status, parsed, path);
  return parsed;
}

export const apiGet = (path, opts) => apiRequest('GET', path, opts);
export const apiPost = (path, opts) => apiRequest('POST', path, opts);
export const apiPatch = (path, opts) => apiRequest('PATCH', path, opts);
export const apiDelete = (path, opts) => apiRequest('DELETE', path, opts);

// For dashboard panels: one dead widget must not blank the whole page.
export async function tryGet(path, fallback = null, opts) {
  try {
    return await apiGet(path, opts);
  } catch (err) {
    console.info('panel_unavailable', { path, status: err?.status });
    return fallback;
  }
}
```

- [x] **Step 5: Run the tests**

Run: `npm test -- api`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add watiq_nextjs_frontend/lib/api.js watiq_nextjs_frontend/lib/format.js \
        watiq_nextjs_frontend/tests/api.test.js
git commit -m "feat(frontend): server-side api client with hand-replayed refresh cookie"
```

---

### Task 7: Auth, guards and CSRF

**Files:**
- Create: `watiq_nextjs_frontend/lib/auth.js`
- Create: `watiq_nextjs_frontend/lib/guards.js`
- Create: `watiq_nextjs_frontend/lib/csrf.js`
- Test: `watiq_nextjs_frontend/tests/auth.test.js`

**Interfaces:**
- Consumes: `apiGet/apiPost/ApiError/captureRefreshCookie/REFRESH_COOKIE` (Task 6), `getSession/setSession/clearSession` (Task 5)
- Produces:
  - `loginCitizen(login, password)`, `loginStaff(email, password)`, `completeMfa(code)`
  - `refreshSession(): Promise<boolean>`, `logout()`
  - `isAuthenticated()`, `isStaff()`, `role()`, `currentProfile()`
  - `requireLogin(nextPath)`, `requireStaff(nextPath)`, `requireAdmin(nextPath)`
  - `issueCsrfToken(): Promise<string>`, `assertCsrf(formData): Promise<void>`

Port of `frontend_flask/auth.py`. Guard semantics, verbatim:
- not authenticated → redirect to `/login?next=<path>` (staff routes add `&staff=1`)
- authenticated but not staff, on a staff route → **`notFound()`**, not 403 (Constraint 8)
- staff but `role` not in `('admin','director')`, on an admin route → `notFound()`

- [x] **Step 1: Write the failing tests**

```js
import { expect, test, vi } from 'vitest';
import { loginCitizen, isAuthenticated, isStaff, logout } from '@/lib/auth.js';
import { requireStaff } from '@/lib/guards.js';
import { getSession } from '@/lib/session.js';
import { SENT } from './setup.js';

test('citizen login stores tokens server-side and marks the role', async () => {
  await loginCitizen('12345678', 'pw');
  expect(SENT.at(-1)).toMatchObject({ method: 'POST', path: '/api/v1/auth/login' });
  expect(SENT.at(-1).json).toEqual({ login: '12345678', password: 'pw' });
  expect(await isAuthenticated()).toBe(true);
  expect(await isStaff()).toBe(false);
  expect((await getSession()).role).toBe('citizen');
});

test('the session never records citizen PII', async () => {
  await loginCitizen('12345678', 'pw');
  const keys = Object.keys(await getSession()).sort();
  expect(keys).toEqual(
    expect.not.arrayContaining(['first_name', 'last_name', 'national_id', 'email', 'phone']),
  );
});

test('a signed-in citizen hitting a staff route gets 404, never 403', async () => {
  await loginCitizen('12345678', 'pw');
  await expect(requireStaff('/staff')).rejects.toThrow(/NEXT_NOT_FOUND/);
});

test('logout revokes upstream then clears regardless', async () => {
  await loginCitizen('12345678', 'pw');
  await logout();
  expect(SENT.at(-1).path).toBe('/api/v1/auth/logout');
  expect(await isAuthenticated()).toBe(false);
});
```

- [x] **Step 2: Run and confirm failure**

Run: `npm test -- auth`
Expected: FAIL — modules not found.

- [x] **Step 3: Implement `lib/auth.js`**

```js
import 'server-only';
import { apiGet, apiPost, ApiError, captureRefreshCookie, REFRESH_COOKIE } from './api.js';
import { getSession, setSession, clearSession } from './session.js';

const BASE = (process.env.WATIQ_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

// Raw fetch rather than apiRequest for the three token-minting calls: they must
// read Set-Cookie off the response themselves, and must not trigger the
// refresh-on-401 retry (there is nothing to refresh yet).
async function tokenCall(path, json, bearer) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(json ?? {}),
    redirect: 'manual',
    cache: 'no-store',
  });
  const body = await response.json().catch(() => null);
  if (response.status >= 400) {
    throw new ApiError(response.status, body?.title ?? '', body?.detail ?? '', body);
  }
  await captureRefreshCookie(response);
  return body;
}

async function store(payload, { staff, role }) {
  await setSession({
    access_token: payload?.access_token ?? '',
    is_staff: staff,
    mfa_required: Boolean(payload?.mfa_required),
    ...(role ? { role } : {}),
  });
}

export async function loginCitizen(login, password) {
  const body = await tokenCall('/api/v1/auth/login', { login, password });
  await store(body, { staff: false, role: 'citizen' });
}

export async function loginStaff(email, password) {
  const body = await tokenCall('/api/v1/auth/login/staff', { email, password });
  await store(body, { staff: true });
  // The role code decides which back-office screens are reachable. It comes
  // from the API, never from anything the browser sent.
  try {
    const me = await apiGet('/api/v1/staff/me');
    await setSession({ role: me?.role_code || 'staff' });
  } catch {
    await setSession({ role: 'staff' });
  }
}

export async function completeMfa(code) {
  const { access_token: token } = await getSession();
  const body = await tokenCall('/api/v1/auth/mfa/complete', { code }, token);
  await setSession({ access_token: body?.access_token ?? '', mfa_required: false });
}

export async function refreshSession() {
  const { refresh_token: token } = await getSession();
  if (!token) return false;
  let response;
  try {
    response = await fetch(BASE + '/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        // Replayed by hand — see the note in lib/api.js.
        Cookie: `${REFRESH_COOKIE}=${token}`,
      },
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return false;
  }
  if (response.status >= 400) {
    await clearSession();
    return false;
  }
  await captureRefreshCookie(response);
  const body = await response.json().catch(() => ({}));
  await setSession({
    access_token: body?.access_token ?? '',
    mfa_required: Boolean(body?.mfa_required),
  });
  return Boolean(body?.access_token);
}

// Revoke server-side first; clear locally regardless of the outcome.
export async function logout() {
  try {
    const { access_token: token } = await getSession();
    if (token) await apiPost('/api/v1/auth/logout', { retryAuth: false });
  } catch { /* the local clear below is what matters */ }
  await clearSession();
}

export async function isAuthenticated() {
  return Boolean((await getSession()).access_token);
}

export async function isStaff() {
  return Boolean((await getSession()).is_staff);
}

export async function role() {
  return String((await getSession()).role || '');
}

// The signed-in person, fetched fresh. Never cached — this is PII.
export async function currentProfile() {
  if (!(await isAuthenticated())) return null;
  const path = (await isStaff()) ? '/api/v1/staff/me' : '/api/v1/auth/me';
  const { tryGet } = await import('./api.js');
  return tryGet(path);
}
```

- [x] **Step 4: Implement `lib/guards.js`**

```js
import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { isAuthenticated, isStaff, role } from './auth.js';
import { flash } from './flash.js';

export async function requireLogin(nextPath) {
  if (!(await isAuthenticated())) {
    await flash('Please sign in to continue.', 'info');
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
}

export async function requireStaff(nextPath) {
  if (!(await isAuthenticated())) {
    await flash('Please sign in to continue.', 'info');
    redirect(`/login?staff=1&next=${encodeURIComponent(nextPath)}`);
  }
  // Not 403: a citizen has no business learning that this route exists at all.
  if (!(await isStaff())) notFound();
}

export async function requireAdmin(nextPath) {
  await requireStaff(nextPath);
  if (!['admin', 'director'].includes(await role())) notFound();
}
```

- [x] **Step 5: Implement `lib/csrf.js`**

Next.js checks Origin/Host on Server Actions, but the Flask app carried an explicit token and the threat model documents it (`config.py:48-52` — the BFF authenticates form POSTs with a cookie, so it needs its own CSRF defence). Keep the explicit token; defence in depth costs nothing here.

```js
import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSession, setSession } from './session.js';

export async function issueCsrfToken() {
  const session = await getSession();
  if (session.csrf_token) return session.csrf_token;
  const token = randomUUID();
  await setSession({ csrf_token: token });
  return token;
}

export async function assertCsrf(formData) {
  const supplied = String(formData.get('csrf_token') || '');
  const { csrf_token: expected } = await getSession();
  // Tied to the session, not to a fixed clock — matches WTF_CSRF_TIME_LIMIT = None.
  if (!expected || supplied !== expected) {
    throw new Error('csrf_failed');
  }
}
```

- [x] **Step 6: Run the tests**

Run: `npm test -- auth`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add watiq_nextjs_frontend/lib/auth.js watiq_nextjs_frontend/lib/guards.js \
        watiq_nextjs_frontend/lib/csrf.js watiq_nextjs_frontend/tests/auth.test.js
git commit -m "feat(frontend): auth, route guards and csrf for the next.js bff"
```

---

### Task 8: Preferences, flash messages and error screens

**Files:**
- Create: `watiq_nextjs_frontend/lib/prefs.js`
- Create: `watiq_nextjs_frontend/lib/flash.js`
- Create: `watiq_nextjs_frontend/app/api/preferences/route.js`
- Create: `watiq_nextjs_frontend/app/error.js`
- Create: `watiq_nextjs_frontend/app/not-found.js`
- Create: `watiq_nextjs_frontend/app/blocked/page.js`
- Test: `watiq_nextjs_frontend/tests/prefs.test.js`

**Interfaces:**
- Produces:
  - `readPrefs() -> { locale, dir, theme, textScale, themeClass, textScaleClass }`
  - `LANGUAGES` — `{ en: {label,native,dir}, fr: {...}, ar: {...} }` in switcher order
  - `flash(message, category)`, `takeFlashes() -> [{message, category}]`

Port of `frontend_flask/app.py:196-266` (`_locale`, `_preferences`, `LANGUAGES`, `THEMES`, `TEXT_SCALES`) and `views/public.py:403` (`/preferences`).

Error mapping, from `app.py:280-330`: **403 and 429 render the dedicated blocked screen** (it shows the session reference and timestamp someone quotes when asking for a review); 401 clears the session; 404/409 and everything else use the generic error screen; an unreachable API is 503.

- [x] **Step 1: Write the failing test**

```js
import { expect, test } from 'vitest';
import { readPrefs, LANGUAGES } from '@/lib/prefs.js';

test('unrecognised cookie values fall back rather than being escaped', async () => {
  const { cookies } = await import('next/headers');
  const jar = await cookies();
  jar.set('watiq_theme', 'dark"><script>');
  jar.set('watiq_text_scale', '999');
  jar.set('watiq_lang', 'zz');

  const prefs = await readPrefs();
  expect(prefs.theme).toBe('light');
  expect(prefs.textScale).toBe(100);
  expect(prefs.locale).toBe('en');
  expect(prefs.themeClass).toBe('');
  expect(prefs.textScaleClass).toBe('');
});

test('arabic is rtl and is offered last', async () => {
  expect(LANGUAGES.ar.dir).toBe('rtl');
  expect(Object.keys(LANGUAGES)).toEqual(['en', 'fr', 'ar']);
});
```

- [x] **Step 2: Run and confirm failure**

Run: `npm test -- prefs`
Expected: FAIL.

- [x] **Step 3: Implement `lib/prefs.js`**

```js
import 'server-only';
import { cookies, headers } from 'next/headers';

export const THEME_COOKIE = 'watiq_theme';
export const TEXT_SCALE_COOKIE = 'watiq_text_scale';
export const LANG_COOKIE = 'watiq_lang';

const THEMES = ['light', 'dark'];
const TEXT_SCALES = [100, 125, 150];

// Order is the order the switcher renders. English is the source language the
// catalogs are keyed on, so it is also the fallback when a message is missing.
export const LANGUAGES = {
  en: { label: 'English', native: 'English', dir: 'ltr' },
  fr: { label: 'French', native: 'Français', dir: 'ltr' },
  ar: { label: 'Arabic', native: 'العربية', dir: 'rtl' },
};

// Accept-Language is only consulted when no choice has been made, so an
// explicit pick always wins over a browser advertising something else.
function negotiate(header) {
  for (const part of String(header || '').split(',')) {
    const tag = part.split(';')[0].trim().slice(0, 2).toLowerCase();
    if (tag in LANGUAGES) return tag;
  }
  return 'en';
}

export async function readPrefs() {
  const jar = await cookies();

  const chosen = jar.get(LANG_COOKIE)?.value;
  const locale = chosen in LANGUAGES ? chosen : negotiate((await headers()).get('accept-language'));

  // Anyone can hand these cookies any value, and they are rendered straight
  // into a class attribute, so an unrecognised one is discarded rather than
  // escaped: the set of legal values is small and closed.
  const rawTheme = jar.get(THEME_COOKIE)?.value;
  const theme = THEMES.includes(rawTheme) ? rawTheme : 'light';

  const rawScale = Number.parseInt(jar.get(TEXT_SCALE_COOKIE)?.value ?? '', 10);
  const textScale = TEXT_SCALES.includes(rawScale) ? rawScale : 100;

  return {
    locale,
    dir: LANGUAGES[locale].dir,
    theme,
    textScale,
    themeClass: theme === 'dark' ? 'dark' : '',
    textScaleClass: textScale === 100 ? '' : `text-scale-${textScale}`,
  };
}
```

- [x] **Step 4: Implement `lib/flash.js`**

```js
import 'server-only';
import { getSession, setSession } from './session.js';

export async function flash(message, category = 'info') {
  const session = await getSession();
  await setSession({ flash: [...(session.flash || []), { message, category }] });
}

// One-shot: reading drains them, exactly like Jinja's get_flashed_messages().
export async function takeFlashes() {
  const { flash: messages = [] } = await getSession();
  if (messages.length) await setSession({ flash: [] });
  return messages;
}
```

- [x] **Step 5: Implement `app/api/preferences/route.js`**

Port `views/public.py:403-452` exactly: accept `theme`, `text_scale` and `lang` from the posted form, validate each against its closed set, set the cookie, and redirect back to the `next` field (same-origin only). It must work without JavaScript, so it responds to a form POST with a 303 redirect rather than JSON.

- [x] **Step 6: Implement the three error screens**

- `app/error.js` — the generic screen, ported from `templates/error.html`, taking `code`, `title`, `message`.
- `app/not-found.js` — renders `templates/error.html` with 404 / "That page does not exist, or you do not have access to it."
- `app/blocked/page.js` — ported from `templates/error_blocked.html`. It shows the session reference and a UTC timestamp rendered server-side so the clock is correct before and without JavaScript.

Titles, verbatim from `app.py:_TITLES`: 401 "Session expired", 403 "Access Restricted", 404 "Page not found", 409 "Conflict", 429 "Too many requests", 502 "Service error".

- [x] **Step 7: Run the tests**

Run: `npm test -- prefs`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add watiq_nextjs_frontend/lib/prefs.js watiq_nextjs_frontend/lib/flash.js \
        watiq_nextjs_frontend/app/api/preferences/ watiq_nextjs_frontend/app/error.js \
        watiq_nextjs_frontend/app/not-found.js watiq_nextjs_frontend/app/blocked/ \
        watiq_nextjs_frontend/tests/prefs.test.js
git commit -m "feat(frontend): reader preferences, flash messages and error screens"
```

---

### Task 9: i18n catalogs

**Files:**
- Create: `watiq_nextjs_frontend/i18n/request.js`
- Create: `watiq_nextjs_frontend/i18n/messages/{en,fr,ar}.json`
- Create: `watiq_nextjs_frontend/tools/po-to-json.mjs`
- Test: `watiq_nextjs_frontend/tests/i18n.test.js`

**Interfaces:**
- Consumes: `readPrefs` (Task 8)
- Produces: `getTranslations()` usable in any Server Component; messages keyed on the English source string.

The catalogs are keyed on English source text rather than symbolic ids, so a component not yet marked up still renders readable English instead of a bare key. Convert `frontend_flask/translations/{fr,ar}/LC_MESSAGES/messages.po` into JSON with a script committed alongside, so the `.po` files stay the reviewable source of truth for this conversion.

- [x] **Step 1: Write the conversion script `tools/po-to-json.mjs`**

Parse `msgid`/`msgstr` pairs (including multi-line continuations), skip entries with an empty `msgstr`, and emit `{ "<msgid>": "<msgstr>" }`. `en.json` is `{}` — English falls through to the key.

- [x] **Step 2: Run it and commit the output**

```bash
node tools/po-to-json.mjs ../frontend_flask/translations/fr/LC_MESSAGES/messages.po > i18n/messages/fr.json
node tools/po-to-json.mjs ../frontend_flask/translations/ar/LC_MESSAGES/messages.po > i18n/messages/ar.json
echo '{}' > i18n/messages/en.json
```

- [x] **Step 3: Write the parity test**

```js
import { expect, test } from 'vitest';
import fr from '@/i18n/messages/fr.json';
import ar from '@/i18n/messages/ar.json';

test('the catalogs are non-trivial and disagree with the source language', () => {
  expect(Object.keys(fr).length).toBeGreaterThan(50);
  expect(Object.keys(ar).length).toBeGreaterThan(50);
  for (const [key, value] of Object.entries(fr)) expect(value).not.toBe('');
  expect(fr['Watiq National Portal']).not.toBe('Watiq National Portal');
});
```

This is the analogue of `tests/test_i18n_catalog.py`: it catches the failure mode where the language switcher appears to do nothing because the catalog never loaded — direction and lang change, every string stays English.

- [x] **Step 4: Implement `i18n/request.js`** using `next-intl`'s `getRequestConfig`, taking the locale from `readPrefs()`.

- [x] **Step 5: Run the test**

Run: `npm test -- i18n`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add watiq_nextjs_frontend/i18n/ watiq_nextjs_frontend/tools/po-to-json.mjs \
        watiq_nextjs_frontend/tests/i18n.test.js
git commit -m "feat(frontend): fr/ar message catalogs converted from the gettext sources"
```

---

## Phase 1 — as built (2026-08-14)

Complete. `73511df`, `36b721e`, `ce3ed27`, `7cbb34a`, `3a453f6`. 83 tests, 6 files.

Where the result differs from the steps above, and why:

1. **`rotateSession()` is new, and login/MFA use it instead of `setSession`.**
   Flask merged new tokens into whatever session id was already present. The
   cookie is not `__Host-`prefixed, so a sibling subdomain can plant one, and
   that id would then hold a signed-in session. Both privilege changes now mint
   a new id and drop the old record, with `captureRefreshCookie` running after
   the rotation so the refresh token lands in the new record.

2. **The guards do not flash.** `flash()` writes the session, writing the
   session may issue the cookie, and Next only permits that from a Server Action
   or Route Handler — so the plan's `requireLogin` would have thrown a
   cookie-write error instead of redirecting an anonymous visitor. They redirect
   with a fixed `?notice=` code that `lib/flash.js` resolves to text. Free text
   in a URL is reflected content and untranslatable besides.

3. **The session cookie carries no `maxAge`.** The plan set one; Flask's
   `SESSION_PERMANENT=False` did not. A persistent cookie on a shared municipal
   terminal hands the session to whoever sits down next. The 8h expiry is on the
   Redis record instead.

4. **`lib/config.js` ports `_from_env_or_file`,** so `REDIS_DSN_FILE` works.
   Production mounts secrets under `/run/secrets` rather than putting them in
   the environment, where `docker inspect` exposes them (Security.md §12.4).

5. **The error mapping keeps all three designs**, not the two the plan
   described. `error.html` dispatched on 401/403/429 → blocked, 502/503/504 →
   maintenance, else generic. `components/FailureScreen.jsx` is that dispatch;
   both designed screens are ported with their page CSS. `lib/error-views.js`
   exists separately because `app/error.js` must be a client component and
   cannot import a `server-only` module.

6. **Language negotiation honours q-values.** The plan took the first supported
   tag in document order; Flask's `best_match` did not. `fr;q=0.2, ar;q=0.9`
   means the reader would rather have Arabic.

7. **i18n is not next-intl, and the dependency is dropped.** next-intl reads a
   dot in a key as a namespace path, and 152 keys are English sentences ending
   in a full stop; its ICU layer treats an apostrophe as an escape, and eight
   keys contain one. Both catalogs have 0 `msgid_plural` and 0 `msgctxt`, so
   nothing it offers is needed. `lib/i18n.js` is gettext semantics in thirty
   lines. `i18n/request.js` was therefore never created.

8. **`assertCsrf` compares in constant time**, and both the CSRF token and the
   session id are 256-bit rather than UUIDs.

### Carried into Phase 2

- The root layout still wraps every route in the **mockup's** `Navbar`/`Footer`.
  `/blocked` and the maintenance screen render their own chrome and must not be
  wrapped — Task 10 needs a route group that excludes them.
- `error_blocked.html` set `html_class = 'light tk-security-acces-blocked'` and
  `error_maintenance.html` set `'light tk-system-maintenance icons-w300'`. Those
  per-page token overrides go on `<html>`, which only the layout can write.
- Copied page CSS needs its `url()` rewritten from `../../img/` to `/img/`;
  webpack resolves relative URLs against the stylesheet directory and fails the
  build rather than 404ing at runtime. Applies to every screen ported later.
- `tests/setup.js` note: a `server.use()` override replaces the catch-all
  handler, so overridden calls never reach `SENT`. Read the payload inside the
  handler when a test needs both.

---

# Phase 2 — Shell

### Task 10: Root layout and shared chrome

**Files:**
- Modify: `watiq_nextjs_frontend/app/layout.js`
- Modify: `watiq_nextjs_frontend/components/{Navbar,Footer,Logo,A11yControls}.js`
- Create: `watiq_nextjs_frontend/components/Flash.js`
- Create: `watiq_nextjs_frontend/components/Loader.js`
- Test: `watiq_nextjs_frontend/tests/layout.test.js`

**Interfaces:**
- Consumes: `readPrefs`, `takeFlashes`, `isAuthenticated`, `isStaff`, `role`, `tryGet`
- Produces: the document shell every route renders inside.

Port of `templates/base.html` and `templates/partials/`. Carry these decisions across unchanged:

- `<html>` gets `class="{pageClass|'light'} {themeClass} {textScaleClass}"`, plus `dir` and `lang`. `light` is kept even in dark mode — it is inert (only `.dark` is wired to `darkMode: 'class'`) and several checks look for one of `tk-`/`light`/`dark` on that element.
- Nav bars and footers are **not** fully shared. The source screens use seven distinct nav variants and five distinct footers; the existing `components/Navbar.js` is one variant. Hoisting them all would silently change the design. Pages that need a variant render their own.
- The a11y overlay is last in the body so it is last in the tab order — it is chrome and must not sit between the skip target and the page's own content.
- The unread-notification badge count comes from `GET /api/v1/notifications/unread-count`, reading `unread_count` (**not** `count` — reading the wrong key made the badge always 0).

- [ ] **Step 1: Write the failing test**

```js
import { expect, test } from 'vitest';
import { render } from './render.js';
import RootLayout from '@/app/layout.js';

test('arabic renders rtl with the locale on <html>', async () => {
  const jar = await (await import('next/headers')).cookies();
  jar.set('watiq_lang', 'ar');
  const html = await render(RootLayout, { children: null });
  expect(html).toContain('dir="rtl"');
  expect(html).toContain('lang="ar"');
});

test('the text-scale class reaches <html>', async () => {
  const jar = await (await import('next/headers')).cookies();
  jar.set('watiq_text_scale', '125');
  const html = await render(RootLayout, { children: null });
  expect(html).toContain('text-scale-125');
});

test('no external origin is referenced', async () => {
  const html = await render(RootLayout, { children: null });
  expect(html).not.toMatch(/https?:\/\/(?!localhost)/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- layout`
Expected: FAIL.

- [ ] **Step 3: Rewrite `app/layout.js`** as an async Server Component reading `readPrefs()` and `takeFlashes()`, emitting the favicon/manifest/theme-color set from `base.html:44-56`, and passing the nonce from the `x-nonce` header to any `<script>` it renders.

- [ ] **Step 4: Port `components/Flash.js` and `components/Loader.js`** from `templates/partials/_flash.html` and `_loader.html`.

- [ ] **Step 5: Update `Navbar`/`Footer`/`A11yControls`** to take their language, theme and auth state as props from the layout rather than the current `useState` placeholders, and to post to `/api/preferences` so the controls work without JavaScript.

- [ ] **Step 6: Run the tests**

Run: `npm test -- layout`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add watiq_nextjs_frontend/app/layout.js watiq_nextjs_frontend/components/ \
        watiq_nextjs_frontend/tests/layout.test.js
git commit -m "feat(frontend): document shell with server-rendered locale and theme"
```

---

# Phases 3–6 — Screen ports

All four phases follow one recipe. Each screen is its own task, its own commit, and its own review gate.

## Starting state (verified 2026-08-13)

`watiq_nextjs_frontend/app/` already contains **21 `page.js` files, ~1,650 lines**. All 21 are client-side mockups: no `fetch`, no `/api/v1` reference, no `'use server'`, no route handlers. `app/login/page.js` fakes authentication with a `setTimeout` and hardcoded credentials in `useState`. Treat the existing markup as a **starting point for the JSX only** — every one still needs its data layer built, and the copy is English-only and hardcoded.

Screens with existing mockup markup (convert client → server component + action):
`/`, `/admin`, `/appointments`, `/dashboard`, `/documents`, `/documents/[id]`, `/documents/upload`, `/faq`, `/login`, `/mfa`, `/notifications`, `/payments/confirmation`, `/profile`, `/requests`, `/requests/[id]`, `/requests/submit`, `/staff/verify/[id]`, `/staff/workbench`, `/support`, `/support/chat`, `/terms`

Screens with no mockup at all (port from Jinja):
`/services`, `/track`, `/register`, `/password-reset`, `/legal/privacy`, `/accessibility`, `/about`, `/open-data`, `/status`, `/security-log`, `/appointments/book`, `/appointments/[id]`, `/payments`, `/staff/appointments`, `/staff/audit`, `/staff/health`, and every admin action route.

## Route path reconciliation — DECIDE BEFORE TASK 11

The mockup invented its own paths. The `Route` column in the inventory below uses **Flask's paths**, because `ops/nginx/conf.d/watiq.conf` applies per-route rate limits to them and `frontend_flask/tests/test_routes.py` asserts them. Renaming a route means updating both.

| Flask path (authoritative) | Existing mockup path to move |
|---|---|
| `/requests/new` | `/requests/submit` |
| `/login/mfa` | `/mfa` |
| `/staff` | `/staff/workbench` |
| `/staff/review/[id]` | `/staff/verify/[id]` |
| `/help` | `/faq` |
| `/legal/terms` | `/terms` |
| `/contact` | `/support` |
| `/requests/[id]/documents/new` | `/documents/upload` |

Default assumption if not overridden: **keep Flask's paths and move the mockup files**, since the nginx rules and the test suite already encode them and they are the URLs currently served.

## The porting recipe

For each row of the inventory below:

1. **Read the Flask view function** named in the row. It defines the control flow, the exact API calls, the query-string handling and the redirect targets. This is the spec — do not improvise.
2. **Read the Jinja template** named in the row. It defines the markup. Port it to JSX preserving class names exactly: the compiled stylesheet is generated from these class strings, and renaming one silently drops its rule.
3. **Create the route** at the path in the row, as an async Server Component. Guard it on the first line with `requireLogin` / `requireStaff` / `requireAdmin` per the row.
4. **Fetch with `tryGet` for dashboard-style panels, `apiGet` for the page's primary record.** A detail page whose subject fails must error; a dashboard whose sidebar widget fails must still render.
5. **Port each POST to a Server Action** in the same folder, in a `'use server'` file. Every action begins with `await assertCsrf(formData)`, and every form renders `<input type="hidden" name="csrf_token" value={await issueCsrfToken()} />`.
6. **Use `<form action={theAction}>`,** never an `onSubmit` handler. Forms must work with JavaScript disabled.
7. **Add the route to `tests/routes.test.js`** in the matching array, then run the suite.
8. **Commit** as `feat(frontend): port <screen name> screen`.

## Screen inventory

The `Route` column is authoritative — these paths are asserted by `frontend_flask/tests/test_routes.py` and by `ops/nginx/conf.d/watiq.conf`, and must not change.

### Phase 3 — Public (Tasks 11–24), guard: none

| # | Route | Flask view | Template | Notes |
|---|---|---|---|---|
| 11 | `/` | `public.index` | `index.html` | The project-map index. Port `screens.py:SECTIONS` to `lib/screens.js` verbatim; only the href changes. |
| 12 | `/login` GET+POST | `public.login` | `login.html` | `?staff=1` toggles staff mode. One generic failure message for every outcome — distinguishing "no such account" from "wrong password" turns this into an account enumerator. On success: MFA → `/login/mfa`, staff → `/staff`, else `next`. |
| 13 | `/login/mfa` GET+POST | `public.mfa` | `mfa.html` | Six single-character boxes all named `code`; join `formData.getAll('code')` so it works without JS. |
| 14 | `/register` GET+POST | `public.register` | `register.html` | |
| 15 | `/logout` POST | `public.logout` | — | Server action only. |
| 16 | `/password-reset` GET+POST | `public.password_reset` | `password_reset.html` | Both the request and the confirm step. |
| 17 | `/services` | `public.services` | `citizen_portal.html` | Catalog + categories + offices. |
| 18 | `/track` | `public.track` | `track.html` | Public tracking by code; renders the empty form when no `code` param. |
| 19 | `/legal/privacy`, `/legal/terms` | `public.privacy`, `public.terms` | `terms.html` | Both use `_content(key)`. |
| 20 | `/accessibility`, `/about`, `/open-data` | `public.accessibility`, `.about`, `.open_data` | `content_page.html` | |
| 21 | `/contact` GET+POST | `public.contact` | `support.html` | |
| 22 | `/help` | `public.help_page` | `faq.html` | Filters on `?topic=` and `?q=`; the empty-result form is a covered case. |
| 23 | `/support/chat` GET+POST | `public.support_chat` | `support_chat.html` | |
| 24 | `/status` | `public.status` | `staff_health.html` | Public status view. |

### Phase 4 — Citizen (Tasks 25–41), guard: `requireLogin`

| # | Route | Flask view | Template | Notes |
|---|---|---|---|---|
| 25 | `/dashboard` | `citizen.dashboard` | `citizen_dashboard.html` | Four independent panels, all `tryGet`. Documents are assembled from the three most recent requests — there is no "all my documents" endpoint. |
| 26 | `/requests` | `citizen.requests_list` | `my_requests.html` | `?page=`, `?status=`; size 20. |
| 27 | `/requests/[id]` | `citizen.request_detail` | `request_detail.html` | Primary record throws; history and documents degrade. |
| 28 | `/requests/new` GET+POST | `citizen.submit_request` | `submit_request.html` | Renders the `office_service_id` field only once `?office_id=` is chosen — both forms are covered cases. |
| 29 | `/requests/[id]/documents` POST | `citizen.upload_document` | — | Multipart. Respect the 12 MB cap mirroring the API's BodySizeMiddleware. |
| 30 | `/requests/[id]/documents/new` | `citizen.upload_page` | `document_upload.html` | |
| 31 | `/documents` | `citizen.documents` | `my_documents.html` | `?status=verified|pending`. |
| 32 | `/requests/[id]/documents/[docId]` | `citizen.document_detail` | `document_detail.html` | |
| 33 | `/documents/[id]/download` | `citizen.download_document` | — | Route handler. The API returns a presigned URL; the storage key never crosses the boundary. |
| 34 | `/documents/[id]/confirm`, `/documents/[id]/delete` POST | `citizen.confirm_document`, `.delete_document` | — | Server actions. |
| 35 | `/security-log` | `citizen.security_log` | `security_log.html` | |
| 36 | `/appointments/book` GET+POST | `citizen.book_appointment` | `book_appointment.html` | **The largest screen.** Three server-rendered wizard steps selected by query string: office list → that office's slots → confirmation. Port `_split_by_half_day` to `lib/slots.js`. All four query-string forms are covered cases. |
| 37 | `/appointments` | `citizen.appointments` | `appointments.html` | |
| 38 | `/appointments/[id]` | `citizen.appointment_detail` | `appointment_detail.html` | |
| 39 | `/appointments/[id]/cancel` POST | `citizen.cancel_appointment` | — | |
| 40 | `/notifications` + `/notifications/[id]/read` + `/notifications/read-all` | `citizen.notifications`, `.mark_read`, `.mark_all_read` | `notification_center.html` | Cursor-paginated, no total. |
| 41 | `/payments`, `/payments/confirmation`, `/profile` | `citizen.payments`, `.payment_confirmation`, `.profile` | `payments.html`, `payment_confirmation.html`, `profile.html` | |

### Phase 5 — Staff (Tasks 42–47), guard: `requireStaff`

| # | Route | Flask view | Template |
|---|---|---|---|
| 42 | `/staff` | `staff.workbench` | `staff_workbench.html` |
| 43 | `/staff/review`, `/staff/review/[id]` | `staff.review` | `verify_request.html` |
| 44 | `/staff/requests/[id]/assign`, `/staff/requests/[id]/status` POST | `staff.assign`, `.set_status` | — |
| 45 | `/staff/documents/[id]/verify` POST | `staff.verify_document` | — |
| 46 | `/staff/appointments` + `/staff/appointments/[id]/status` | `staff.office_appointments`, `.appointment_status` | `staff_appointments.html` |
| 47 | `/staff/audit`, `/staff/health` | `staff.audit`, `.health` | `staff_audit.html`, `staff_health.html` |

`staff_workbench.html` and `verify_request.html` carry `class="h-full"` on `<html>` — that is functional, not decoration: their bodies are `h-full flex overflow-hidden` and the sidebar layout collapses to content height without it. Pass it as the layout's page class.

### Phase 6 — Admin (Tasks 48–50), guard: `requireAdmin`

| # | Route | Flask view | Template |
|---|---|---|---|
| 48 | `/admin` | `admin.index` | `admin_management.html` |
| 49 | `/admin/users/[id]/{deactivate,reactivate,anonymize}` POST | `admin.deactivate_user`, `.reactivate_user`, `.anonymize_user` | — |
| 50 | `/admin/staff` POST, `/admin/staff/[id]/{deactivate,reactivate}` POST, `/admin/roles/[id]/permissions` POST | `admin.create_staff`, `.deactivate_staff`, `.reactivate_staff`, `.update_role_permissions` | — |

Note: the existing `app/admin/page.js` is a mockup with hardcoded metrics and must be **replaced**, not extended.

---

# Phase 7 — Test suite

### Task 51: Port the route and guard suite

**Files:**
- Create: `watiq_nextjs_frontend/tests/routes.test.js`

Port `frontend_flask/tests/test_routes.py`. Keep `PUBLIC_GETS`, `CITIZEN_GETS` and `STAFF_GETS` as the same arrays of paths — including the query-string variants, which exist because those pages render differently with and without their parameters.

- [ ] **Step 1:** Transcribe the three path arrays verbatim from `test_routes.py:9-46`.
- [ ] **Step 2:** Assert every public path renders 200 and contains `<html`.
- [ ] **Step 3:** Assert every citizen path renders 200 with a citizen session and **redirects to `/login` when signed out**.
- [ ] **Step 4:** Assert every staff path renders 200 with an admin session and **404s (not 403) for a signed-in citizen**.
- [ ] **Step 5:** Run `npm test -- routes`. Expected: PASS.
- [ ] **Step 6:** Commit.

### Task 52: Port the API contract suite

**Files:**
- Create: `watiq_nextjs_frontend/tests/contracts.test.js`

Port `frontend_flask/tests/test_api_contracts.py`. These assert on the payload the BFF **sent**, not on the page it rendered — several write paths were posting fields the API does not accept, and no render-only test can see that. Use the `SENT` array from Task 4.

### Task 53: Port the dead-control and markup gates

**Files:**
- Create: `watiq_nextjs_frontend/tests/dead-controls.test.js`

Port `frontend_flask/tests/test_no_dead_controls.py`: crawl every rendered page and assert no `<a href="#">`, no `<button>` outside a form with no action, and no link to a route that does not exist. `test_markup_balance.py` has no analogue — JSX cannot produce unbalanced markup — so it is retired here rather than ported. Note that in the commit message.

### Task 54: Playwright smoke test

**Files:**
- Create: `watiq_nextjs_frontend/tests/e2e/smoke.spec.js`

One flow against the real stack: load `/`, sign in as a citizen, land on `/dashboard`, switch the language to Arabic and assert `dir="rtl"`, bump the text scale and assert the computed `font-size` actually changed. That last assertion is the only end-to-end check that the PostCSS text-scale step survived the build.

---

# Phase 8 — Cut over

### Task 55: Dockerfile for the Next.js BFF

**Files:**
- Create: `watiq_nextjs_frontend/Dockerfile`
- Create: `watiq_nextjs_frontend/.dockerignore`

Mirror the hardening of `frontend_flask/Dockerfile` and `backend/Dockerfile`: multi-stage, base images pinned by **multi-arch index digest** (verify with `docker buildx imagetools inspect node:22-bookworm-slim` and confirm both `linux/amd64` and `linux/arm64` appear before pinning), root-owned files executed by uid `10001`, `EXPOSE 3000`, and a `HEALTHCHECK` hitting `/healthz`.

Build stage runs `npm ci && npm run build`; runtime stage copies `.next/standalone`, `.next/static` and `public/`, and runs `node server.js`.

- [ ] **Step 1:** Write the Dockerfile.
- [ ] **Step 2:** Add `/healthz` and `/readyz` route handlers under `app/`, ported from `app.py:60-83`. `/healthz` is liveness only and deliberately does **not** call the API — a health check that fails when its upstream is down turns a recoverable API blip into the orchestrator killing every replica. `/readyz` does check upstream and returns 503 when it is unreachable.
- [ ] **Step 3:** `docker build -t watiq-frontend:test watiq_nextjs_frontend/` — expect success.
- [ ] **Step 4:** `docker run --rm -p 3000:3000 watiq-frontend:test` then `curl localhost:3000/healthz` — expect `{"status":"ok"}`.
- [ ] **Step 5:** Commit.

### Task 56: Rewire compose, nginx, Makefile and run.sh; delete frontend_flask

**Files:**
- Modify: `docker-compose.yml:380-404`
- Modify: `docker-compose.prod.yml:73-105`
- Modify: `ops/nginx/nginx.conf:113-116`
- Modify: `ops/nginx/conf.d/watiq.conf:75-81`
- Modify: `Makefile:2,39-47`
- Modify: `run.sh` (the `ensure_frontend_env` / `ensure_frontend_assets` machinery, ~lines 317-380, 441-447, 513-535, 559-590)
- Modify: `.env.example`, `README.md`, `Architecture.md`, `Structure.md`
- Delete: `frontend_flask/`

- [ ] **Step 1: `docker-compose.yml`** — change `build.context` to `./watiq_nextjs_frontend`, the port mapping to `127.0.0.1:${FRONTEND_PORT:-3000}:3000`, and the env block to `ENV`, `WATIQ_API_URL: http://api:8000`, `REDIS_DSN: redis://session-store:6379/0`, `SESSION_SECRET`. Keep the `depends_on` on `api` + `session-store` and the `networks: [watiq_edge, watiq_app]` — the BFF still has no business on `watiq_data`. Keep the comment explaining why.
- [ ] **Step 2: `docker-compose.prod.yml`** — same environment changes; keep `read_only: true`, the `tmpfs` mount, `cap_drop`, `seccomp`, `user: "10001:10001"`, `replicas: 2` and the `watiq-frontend` network alias. Next.js writes its cache to `.next/cache` at runtime, so add `/app/.next/cache` to the `tmpfs` list alongside `/tmp`.
- [ ] **Step 3: nginx** — `nginx.conf:116` becomes `server watiq-frontend:3000`. In `conf.d/watiq.conf`, replace the `location /static/` block with `location /_next/static/` (Next.js's asset path) and add `location /img/` and `location /fonts/` for the vendored assets, all still proxying to `watiq_frontend`. The `/api/`, `/login`, `/register`, `/password-reset`, `/track` and rate-limit blocks are unchanged — those paths are identical in the port.
- [ ] **Step 4: `Makefile`** — `test-frontend` becomes `cd watiq_nextjs_frontend && npm test`; `frontend-build` becomes `cd watiq_nextjs_frontend && npm ci && npm run build`; `frontend-dev` becomes `cd watiq_nextjs_frontend && npm run dev`. Drop the now-meaningless split between the CSS watch and the app process.
- [ ] **Step 5: `run.sh`** — delete `ensure_frontend_env` entirely (there is no frontend Python environment any more) and reduce `ensure_frontend_assets` to an `npm ci` in `watiq_nextjs_frontend`. Update `FRONTEND_URL` to port 3000 and the native-run path to `npm run dev`.
- [ ] **Step 6: Verify the stack comes up before deleting anything**

```bash
docker compose build frontend && docker compose up -d
curl -sf http://127.0.0.1:3000/healthz
curl -sf http://127.0.0.1:3000/ | grep -q '<html'
```
Expected: both succeed. **Do not proceed to Step 7 until they do.**

- [ ] **Step 7: Delete the Flask app**

```bash
git rm -r frontend_flask
```

- [ ] **Step 8: Sweep for stragglers**

```bash
grep -rn "frontend_flask" . --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=graphify-out
```
Expected: no output. Update `README.md`, `Architecture.md` and `Structure.md` for any prose hit.

- [ ] **Step 9: Full verification**

```bash
docker compose down -v && docker compose up -d
make test-frontend
```
Expected: stack boots clean from empty volumes; frontend suite passes.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: replace the flask bff with the next.js frontend

Ports all 38 screens, the Redis session store, the guards and the fr/ar
catalogs to Next.js App Router, preserving ADR-005 (no token in the browser)
and ADR-003 (no citizen PII in Redis). Rewires compose, nginx, the Makefile
and run.sh to the new service on :3000, and adds the per-request CSP nonce
that Next.js hydration requires."
```

---

## Self-Review

**Spec coverage.** Every Flask view in `views/{public,citizen,staff,admin}.py` appears in the Phase 3–6 inventory; every module in `api.py`/`auth.py`/`config.py`/`app.py` is covered by Tasks 5–9; every test file in `frontend_flask/tests/` is covered by Tasks 51–53, with `test_markup_balance.py` explicitly retired and the reason recorded. Every file outside `frontend_flask/` that greps for `frontend_flask` — `docker-compose.yml`, `docker-compose.prod.yml`, `Makefile`, `run.sh` — is in Task 56, plus the two nginx files that reference port 5000.

**Two things this plan adds that Flask did not need**, both flagged where they arise: the CSP nonce (Task 3 — without it the app is a blank page behind nginx) and the `.next/cache` tmpfs mount (Task 56 Step 2 — without it a read-only root filesystem breaks the container at runtime).

**One known deviation.** `frontend_flask/tools/` also holds `build_logo.py`, `build_tokens.py`, `vendor_assets.py` and `i18n.sh` — the generators for the token CSS, the vendored fonts and the logo. Their *outputs* are already committed under `watiq_nextjs_frontend/styles/` and `public/`, so the port does not need them at build time, but deleting `frontend_flask/` deletes the generators. Task 56 Step 7 should move `tools/build_tokens.py`, `tools/vendor_assets.py` and `tools/build_logo.py` to `watiq_nextjs_frontend/tools/` rather than deleting them, or the design tokens become uneditable.
