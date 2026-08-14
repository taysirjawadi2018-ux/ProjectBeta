import 'server-only';
import { apiGet, apiPost, ApiError, captureRefreshCookie, REFRESH_COOKIE } from './api.js';
import { getSession, setSession, clearSession, rotateSession } from './session.js';
import { API_URL } from './config.js';

/**
 * Sign-in, token refresh and session state. Port of frontend_flask/auth.py.
 *
 * The session holds tokens and the coarse role, nothing else. Anything shown on
 * screen — name, national ID, office — is fetched from the API on the request
 * that renders it and thrown away afterwards, so no citizen PII is written to
 * Redis (Backend.md §7, ADR-003).
 */

/**
 * Raw fetch rather than apiRequest for the token-minting calls. They must read
 * Set-Cookie off the response themselves, and must not trigger the
 * refresh-on-401 retry — on a failed login there is nothing to refresh, and the
 * retry would turn one rejected credential into two requests against the
 * rate-limited endpoint.
 */
async function tokenCall(path, json, bearer) {
  const response = await fetch(API_URL() + path, {
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
  return { body, response };
}

/**
 * Land a freshly minted token set in a NEW session id.
 *
 * rotateSession, not setSession: merging into the existing id leaves the BFF
 * open to session fixation. The session cookie is not __Host-prefixed, so a
 * sibling subdomain can plant a value the victim's browser will send, and that
 * id would then be holding a signed-in session.
 *
 * captureRefreshCookie runs after the rotation so the refresh token is written
 * into the new record rather than the discarded one.
 */
async function establish(payload, response, { staff, role }) {
  await rotateSession({
    access_token: payload?.access_token ?? '',
    is_staff: staff,
    mfa_required: Boolean(payload?.mfa_required),
    ...(role ? { role } : {}),
  });
  await captureRefreshCookie(response);
}

export async function loginCitizen(login, password) {
  const { body, response } = await tokenCall('/api/v1/auth/login', { login, password });
  await establish(body, response, { staff: false, role: 'citizen' });
}

export async function loginStaff(email, password) {
  const { body, response } = await tokenCall('/api/v1/auth/login/staff', { email, password });
  await establish(body, response, { staff: true });
  // The role code decides which back-office screens are reachable. It comes
  // from the API, never from anything the browser sent.
  try {
    const me = await apiGet('/api/v1/staff/me');
    await setSession({ role: me?.role_code || 'staff' });
  } catch {
    await setSession({ role: 'staff' });
  }
}

/** Step-up for a partial staff session (Backend.md §6.4). */
export async function completeMfa(code) {
  const session = await getSession();
  const { body, response } = await tokenCall(
    '/api/v1/auth/mfa/complete',
    { code },
    session.access_token,
  );
  // Also a privilege change, so also a new id — a partial session that an
  // attacker knows must not become a full one.
  await rotateSession({
    ...session,
    access_token: body?.access_token ?? '',
    mfa_required: false,
  });
  await captureRefreshCookie(response);
}

/** Rotate the access token. Returns false if the session is finished. */
export async function refreshSession() {
  const { refresh_token: token } = await getSession();
  if (!token) return false;

  let response;
  try {
    response = await fetch(API_URL() + '/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        // Replayed by hand — see the module docstring in lib/api.js. The API
        // reads this cookie only from the request, and a Secure cookie does not
        // survive the plaintext in-cluster hop in any jar.
        Cookie: `${REFRESH_COOKIE}=${token}`,
      },
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    // Unreachable API: leave the session alone. It may still be valid once the
    // API comes back, and clearing it would sign everyone out during a blip.
    return false;
  }

  if (response.status >= 400) {
    // A rejected refresh token is final.
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

/** Revoke server-side first; clear locally regardless of the outcome. */
export async function logout() {
  try {
    const { access_token: token } = await getSession();
    if (token) await apiPost('/api/v1/auth/logout', { retryAuth: false });
  } catch {
    /* the local clear below is what actually signs the person out */
  }
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

/** The signed-in person, fetched fresh. Never cached — this is PII. */
export async function currentProfile() {
  if (!(await isAuthenticated())) return null;
  const path = (await isStaff()) ? '/api/v1/staff/me' : '/api/v1/auth/me';
  const { tryGet } = await import('./api.js');
  return tryGet(path);
}
