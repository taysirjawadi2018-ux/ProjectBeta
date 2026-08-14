import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getSession, setSession } from './session.js';

/**
 * Explicit CSRF token for form posts.
 *
 * Next.js already compares Origin against Host on Server Actions, which covers
 * the common case. The explicit token stays anyway, because the threat model
 * documents it (frontend_flask/config.py:48-52 — the BFF authenticates form
 * POSTs with a cookie, so it needs its own CSRF defence, and the API's
 * OriginGuardMiddleware protects the API from browsers rather than this server
 * from forged posts). It also covers the Route Handlers, which get no Origin
 * check of their own.
 */

export const CSRF_FIELD = 'csrf_token';

export class CsrfError extends Error {
  constructor() {
    super('csrf_failed');
    this.name = 'CsrfError';
  }
}

/**
 * Stable for the life of the session, matching WTF_CSRF_TIME_LIMIT = None —
 * tied to the session rather than to a fixed clock, so a form left open on a
 * slow connection does not fail on submit.
 *
 * Writes the session, so this may only be called from a Server Action or a
 * Route Handler. A page that renders a form calls it from the action it posts
 * to, or from a Route Handler, not from the component body.
 */
export async function issueCsrfToken() {
  const session = await getSession();
  if (session[CSRF_FIELD]) return session[CSRF_FIELD];
  const token = randomBytes(32).toString('base64url');
  await setSession({ [CSRF_FIELD]: token });
  return token;
}

export async function assertCsrf(formData) {
  const supplied = String(formData?.get?.(CSRF_FIELD) ?? '');
  const expected = String((await getSession())[CSRF_FIELD] ?? '');

  if (!expected || !supplied) throw new CsrfError();

  // Constant-time. Lengths must match first because timingSafeEqual throws on
  // a length mismatch, and that throw is itself an early exit.
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new CsrfError();
}
