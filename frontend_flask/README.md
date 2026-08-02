# Watiq — Flask frontend (BFF)

The twelve design mockups, ported to Jinja and wired to the FastAPI backend in
`../backend`.

This is a **back-end-for-frontend**, not a static site and not an SPA. A form
POST lands on a Flask route, which calls the API server-side with a Bearer token
held in a Redis-backed session, and renders the result into Jinja. The browser
never receives an API token, which is what ADR-005 requires, and every page
works with JavaScript turned off.

```
Browser ──form POST──> Flask (BFF) ──httpx + Bearer──> FastAPI
                          │
                    session in Redis:
                    tokens only, no PII
```

## Run

```bash
# whole stack
make up                      # http://127.0.0.1:5000

# just the frontend, against an API already running on :8000
npm install && npm run build         # compile the design tokens
python -m venv .venv && .venv/bin/pip install -r requirements.txt
WATIQ_API_URL=http://127.0.0.1:8000 .venv/bin/python app.py
```

`make test-frontend` runs the suite. `make frontend-build` recompiles the CSS.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `WATIQ_API_URL` | `http://127.0.0.1:8000` | upstream API |
| `REDIS_DSN` | `redis://127.0.0.1:6379/1` | session store |
| `SECRET_KEY` / `SECRET_KEY_FILE` | generated in dev | **required** outside dev; prefer the `_FILE` form so it is mounted, not visible in `docker inspect` |
| `ENV` | `dev` | anything else enables secure cookies, ProxyFix and hard-fails without Redis |

## Routes

Public: `/` `/login` `/login/mfa` `/register` `/password-reset` `/services`
`/track` `/legal/privacy` `/legal/terms` `/accessibility` `/contact` `/about`
`/help` `/open-data`

Citizen (`@login_required`): `/dashboard` `/requests` `/requests/<id>`
`/requests/new` `/appointments` `/appointments/book` `/notifications`
`/payments` `/payments/confirmation` `/profile`

Staff (`@staff_required`): `/staff` `/staff/review[/<id>]` `/staff/appointments`
`/staff/audit`

Admin (`@admin_required`): `/admin?tab=users|staff|roles`

A citizen hitting a staff or admin route gets **404, not 403** — a 403 confirms
the route exists, and `Security.md §7.3` makes the API answer 404 for the same
reason.

## Structure

```
app.py       factory: session, CSRF, ProxyFix, error handlers, health probes
config.py    settings; *_FILE variables read secrets off disk
api.py       the only module that talks to the API
auth.py      sign-in, refresh, guards
screens.py   project-map card registry
views/       public | citizen | staff | admin blueprints
templates/   the 12 ported screens + the ones that had no design
static/      compiled CSS, self-hosted fonts, 27 vendored images, JS
```

**Navigation bars and footers are not shared** across the ported screens. The
mockups use seven nav variants and five footers; hoisting them into one
component would silently change the design. Screens that had *no* mockup
(`register`, `profile`, `request_detail`, the content pages, …) extend
`_page.html`, which uses the `citizen_portal` nav and the `index` footer.

## Two things that are load-bearing

**The refresh cookie is replayed by hand.** The API sets `__Host-wtq_rt` with
`Secure` and reads it *only* from `request.cookies` — the `RefreshIn.refresh_token`
body field exists in the schema but is never consulted. Over the plaintext
in-cluster hop (`http://api:8000`) an httpx cookie jar discards a `Secure` cookie
outright, so `api.py` captures it from `Set-Cookie` and sends it back as an
explicit `Cookie` header. Do not "simplify" this into `client.cookies`.

**Login rate limiting moved.** With the BFF in front, a person signing in POSTs
to `/login` *here*; the call to `/api/v1/auth/login` is then server-to-server and
arrives with the frontend container's address. The `limit_req zone=login` on the
API path would have seen one client for the whole country. `ops/nginx/conf.d/watiq.conf`
now rate-limits `/login`, `/register`, `/password-reset` and `/track` at the edge.

## Assets

The mockups loaded Tailwind, fonts and images from CDNs. The production CSP is

```
default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:
```

which rejects all of it — including inline `<style>` blocks, inline `style=`
attributes and inline `<script>`. So:

- design tokens → `tailwind.config.js` → `static/css/watiq.css` (`npm run build`)
- per-page `<style>` blocks → `static/css/pages/*.css`, kept **separate** rather
  than merged, because several pages define the same class with different values
  (`login`'s `.interpreter-overlay` has `display: none`, `notification_center`'s
  does not — merging would have hidden one of them)
- Public Sans + Material Symbols self-hosted; the icon font is subsetted to the
  81 icons actually used (26 KB instead of ~3.5 MB). **Adding a new icon means
  regenerating the subset**, or it renders as its literal ligature text.
- 27 images vendored into `static/img/`
- inline `style=` → utility classes; inline `<script>` → `static/js/pages/*.js`

A test asserts none of these reappear.

## What changed from the mockups

1. `{{DATA:SCREEN:n}}` placeholders → real routes.
2. **71 dead `href="#"` and 89 handler-less buttons** now resolve. Navigation
   buttons became links, actions became form submits, and pure-UI controls
   (filters, accessibility toggles, document zoom) got `data-action` hooks
   handled by `static/js/watiq.js`.
3. Copyright year templated — the mockups disagreed (three said 2024, seven 2026).
4. `<html class="h-full">` restored on `staff_workbench` and `verify_request`.
   `base.html` had hardcoded `class="light"`; on those two pages the class is
   functional — their bodies are `h-full flex overflow-hidden`, so without a
   full-height root the sidebar layout collapses.
5. Sample data replaced by real API data throughout.

## Known gaps

- **`/admin` had no design.** `frontend/admin_managment.html` is a byte-for-byte
  copy of `index.html`. The screen is built from existing design-system
  components and covers all 11 admin endpoints, but it has not been through
  design review.
- **Date/time selection on `/appointments/book` had no design either** — the
  mockup only drew step 1. The slot picker reuses the office-card treatment.
- **No PDF receipt endpoint exists**, so "Download PDF Receipt" prints the
  confirmation instead.
- **Profile is read-only** — the API exposes no citizen-facing update endpoint,
  so the page shows the record rather than offering a form that cannot save.
- **`status_ids` in `views/staff.py` are hardcoded** to the `request_status`
  seed values in `Watiq.sql`. Reseeding that lookup means correcting them there.
- **Not verified against a running stack.** Docker was unavailable on the
  machine this was built on; the suite runs against a mocked API transport, and
  compose/nginx were validated by parsing, not by starting them.
