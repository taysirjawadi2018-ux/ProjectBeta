import 'server-only';
import { cookies } from 'next/headers';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { IS_DEV, REDIS_DSN } from './config.js';

/**
 * Server-side, Redis-backed sessions. The cookie carries an opaque session id
 * only; tokens never reach the browser (ADR-005).
 *
 * Port of frontend_flask/config.py:31-46 plus Flask-Session. The cookie name
 * and key prefix are deliberately identical to Flask's so a deployment that
 * swaps the two apps does not invalidate every live session.
 *
 * Note on where these may be called: `cookies()` is read-only inside a Server
 * Component. Anything that writes — setSession, rotateSession, clearSession —
 * only works from a Server Action or a Route Handler. getSession is safe
 * everywhere.
 */

export const SESSION_COOKIE = 'wtq_session';
export const SESSION_PREFIX = 'wtq:fe:sess:';

// Flask left the Redis record at PERMANENT_SESSION_LIFETIME (31 days) and let
// the browser-session cookie do the real expiring. 8h is a server-side cap on
// top of that: it bounds how long a stolen refresh token stays usable, and it
// is longer than any single visit to a government portal.
const TTL_SECONDS = 60 * 60 * 8;

let client;

function redis() {
  if (client) return client;
  client = new Redis(REDIS_DSN(), { lazyConnect: false, maxRetriesPerRequest: 2 });
  return client;
}

/**
 * 256 bits from the CSPRNG. Flask signed the id with SECRET_KEY
 * (SESSION_USE_SIGNER); this substitutes entropy for the signature, which
 * covers the same ground — an id that cannot be guessed cannot be forged — and
 * removes the shared-secret dependency between replicas.
 */
function newSessionId() {
  return randomBytes(32).toString('base64url');
}

/**
 * Outside dev a missing Redis must be a hard failure rather than a silent
 * downgrade to a cookie-backed session: that would put the access token in the
 * browser, which is the exact thing the BFF exists to prevent. Called from the
 * health route so the failure surfaces on deploy rather than on a citizen's
 * first sign-in.
 */
export async function assertStoreReachable() {
  try {
    await redis().ping();
  } catch (err) {
    if (!IS_DEV) {
      throw new Error(`Redis is required for server-side sessions outside dev: ${err.message}`);
    }
    throw err;
  }
}

export async function getSession() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return {};
  try {
    const raw = await redis().get(SESSION_PREFIX + id);
    return raw ? JSON.parse(raw) : {};
  } catch {
    // An unreachable store reads as signed out. Throwing here would turn a
    // Redis blip into a 500 on every page including the public ones.
    return {};
  }
}

function issueCookie(jar, id) {
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    // Lax rather than Strict: Strict drops the cookie on a top-level
    // navigation back from an external payment gateway, silently logging the
    // citizen out mid-transaction.
    sameSite: 'lax',
    secure: !IS_DEV,
    path: '/',
    // No maxAge and no expires, matching Flask's SESSION_PERMANENT=False. The
    // cookie dies with the browser; on a shared municipal terminal a persistent
    // one would hand the session to whoever sits down next.
  });
}

export async function setSession(patch) {
  const jar = await cookies();
  let id = jar.get(SESSION_COOKIE)?.value;
  if (!id) {
    id = newSessionId();
    issueCookie(jar, id);
  }
  const merged = { ...(await getSession()), ...patch };
  await redis().set(SESSION_PREFIX + id, JSON.stringify(merged), 'EX', TTL_SECONDS);
}

/**
 * Start a new session id, discarding the old record, and write `contents` into
 * it. Use this at every privilege change — sign-in and MFA completion — not
 * setSession.
 *
 * Without it the BFF is open to session fixation: an attacker who can plant a
 * `wtq_session` value the victim's browser will send (a sibling subdomain is
 * enough, since the cookie is not __Host-prefixed) holds a live, signed-in
 * session as soon as the victim logs in, because setSession would merge the
 * new tokens into the id the attacker already knows.
 */
export async function rotateSession(contents = {}) {
  const jar = await cookies();
  const old = jar.get(SESSION_COOKIE)?.value;
  if (old) await redis().del(SESSION_PREFIX + old).catch(() => {});

  const id = newSessionId();
  issueCookie(jar, id);
  await redis().set(SESSION_PREFIX + id, JSON.stringify(contents), 'EX', TTL_SECONDS);
}

export async function clearSession() {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await redis().del(SESSION_PREFIX + id).catch(() => {});
  jar.delete(SESSION_COOKIE);
}
