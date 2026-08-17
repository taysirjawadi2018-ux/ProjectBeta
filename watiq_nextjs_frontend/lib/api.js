import 'server-only';
import { headers } from 'next/headers';
import { getSession, setSession } from './session.js';
import { API_TIMEOUT_MS, API_URL } from './config.js';

/**
 * HTTP client for the Watiq API. Port of frontend_flask/api.py.
 *
 * This is the only module that talks to the backend. Everything else calls
 * apiGet/apiPost/... and gets parsed JSON or an ApiError.
 *
 * Two things here are load-bearing:
 *
 * 1. The access token never leaves the server. It lives in the Redis-backed
 *    session and is attached here as a Bearer header. Nothing is written to
 *    web storage or to a readable cookie, which is what ADR-005 requires.
 *
 * 2. The refresh cookie is replayed by hand. The API sets `__Host-wtq_rt` with
 *    the Secure flag and reads it ONLY from request.cookies
 *    (modules/auth/router.py) — the RefreshIn.refresh_token body field is
 *    accepted by the schema but never consulted. Over a plaintext in-cluster
 *    hop (http://api:8000) any cookie jar discards a Secure cookie outright, so
 *    the value is captured from Set-Cookie here and sent back as an explicit
 *    Cookie header by refreshSession(). Do not "simplify" this into a fetch
 *    cookie jar — fetch has no cookie jar on the server at all, and the one
 *    place this could be made to look tidy is the one place it would break.
 */

export const REFRESH_COOKIE = '__Host-wtq_rt';

/**
 * Session keys. Deliberately short: this is everything the BFF stores about a
 * signed-in person. No name, national_id, email, phone or address — citizen PII
 * is never written to Redis (Backend.md §7, ADR-003); it is fetched per request
 * and rendered straight into the response.
 */
export const S_ACCESS = 'access_token';
export const S_REFRESH = 'refresh_token';
export const S_ROLE = 'role';
export const S_STAFF = 'is_staff';
export const S_MFA = 'mfa_required';

/** A non-2xx response, carrying the API's RFC 9457 problem detail. */
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

  /**
   * What is safe to show a citizen.
   *
   * The API's own messages are written for operators and can be specific
   * enough to confirm that a record exists. 404 in particular must stay
   * opaque: Security.md §7.3 makes BOLA return 404 rather than 403 precisely
   * so it is not an existence oracle, and echoing "request 8813 belongs to
   * another user" would hand that back.
   */
  userMessage() {
    return (
      {
        400: 'That request could not be processed. Please check the form and try again.',
        401: 'Your session has expired. Please sign in again.',
        403: 'You do not have permission to do that.',
        404: 'Not found.',
        409: 'That action conflicts with the current state of the record.',
        // 422 is the exception: these are the citizen's own field errors, and
        // withholding them means a form that rejects input without saying why.
        422: this.detail || 'Some of the information provided is not valid.',
        429: 'Too many attempts. Please wait a moment and try again.',
        503: 'The service is temporarily unavailable. Please try again shortly.',
      }[this.status] || 'Something went wrong. Please try again.'
    );
  }
}

/** Pull __Host-wtq_rt out of Set-Cookie by hand (see the module docstring). */
export async function captureRefreshCookie(response) {
  const raws = response.headers.getSetCookie?.() ?? [];
  for (const raw of raws) {
    if (raw.startsWith(`${REFRESH_COOKIE}=`)) {
      // Value only — everything after the first ';' is attributes, and the
      // value itself may contain '=' padding.
      const value = raw.split(';', 1)[0].split('=').slice(1).join('=');
      await setSession({ [S_REFRESH]: value });
      return;
    }
  }
}

async function buildHeaders(auth, extra) {
  const h = { Accept: 'application/json' };
  if (auth) {
    const token = (await getSession())[S_ACCESS];
    if (token) h.Authorization = `Bearer ${token}`;
  }
  // Propagated so one citizen action is greppable end to end across nginx, the
  // BFF and the API. Absent outside a request scope, which is fine.
  try {
    const rid = (await headers()).get('x-request-id');
    if (rid) h['X-Request-ID'] = rid;
  } catch {
    /* no request scope */
  }
  return { ...h, ...(extra || {}) };
}

async function parse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function throwApiError(status, body, path) {
  let title = '';
  let detail = '';
  if (body && typeof body === 'object') {
    title = String(body.title ?? '');
    detail = String(body.detail ?? '');
    // 422 from FastAPI validation arrives as {"detail": [ {loc, msg}, ... ]}.
    // loc[0] is always "body"/"query", which means nothing to a citizen.
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

  const url = new URL(API_URL() + path);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const send = async () =>
    fetch(url, {
      method,
      headers: {
        ...(await buildHeaders(auth, extra)),
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: json !== undefined ? JSON.stringify(json) : body,
      // The API never redirects a legitimate call. Following one would replay
      // the Authorization header at whatever host it named.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS()),
      ...rest,
    });

  let response = await send();

  // Refresh once on 401, then give up. Imported lazily because auth.js imports
  // this module; the cycle is only a problem at module-init time.
  if (response.status === 401 && auth && retryAuth) {
    const { refreshSession } = await import('./auth.js');
    if (await refreshSession()) response = await send();
  }

  const parsed = await parse(response);
  if (response.status >= 400) throwApiError(response.status, parsed, path);
  return parsed;
}

export const apiGet = (path, opts) => apiRequest('GET', path, opts);
export const apiPost = (path, opts) => apiRequest('POST', path, opts);
export const apiPatch = (path, opts) => apiRequest('PATCH', path, opts);
export const apiDelete = (path, opts) => apiRequest('DELETE', path, opts);

/**
 * For dashboard panels: one dead widget must not blank the whole page.
 *
 * Catches transport failures as well as ApiError — an unreachable API is
 * exactly the case where a dashboard should degrade rather than 500.
 */
export async function tryGet(path, fallback = null, opts) {
  try {
    return await apiGet(path, opts);
  } catch (err) {
    console.info('panel_unavailable', { path, status: err?.status });
    return fallback;
  }
}
