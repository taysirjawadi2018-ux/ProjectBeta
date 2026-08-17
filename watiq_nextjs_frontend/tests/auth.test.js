import { expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { cookies } from 'next/headers';
import {
  loginCitizen,
  loginStaff,
  completeMfa,
  refreshSession,
  logout,
  isAuthenticated,
  isStaff,
  role,
  currentProfile,
} from '@/lib/auth.js';
import { requireLogin, requireStaff, requireAdmin } from '@/lib/guards.js';
import { issueCsrfToken, assertCsrf, CsrfError, CSRF_FIELD } from '@/lib/csrf.js';
import { getSession, setSession, SESSION_COOKIE, SESSION_PREFIX } from '@/lib/session.js';
import { ApiError, REFRESH_COOKIE } from '@/lib/api.js';
import { SENT, server } from './setup.js';
import { redisStore } from './mocks/ioredis.js';

const API = 'http://api:8000';

/** Records what the BFF sent, since a server.use() override bypasses SENT. */
function record(box) {
  return async ({ request }) => {
    box.method = request.method;
    box.headers = request.headers;
    box.json = await request.clone().json().catch(() => null);
  };
}

/**
 * notFound() signals through a thrown error's `digest`, and the format is
 * Next's own: 'NEXT_HTTP_ERROR_FALLBACK;404' as of 15 (it was 'NEXT_NOT_FOUND'
 * before). Asserting on the 404 rather than on the whole string keeps this from
 * breaking on the next rename while still failing if a guard starts throwing a
 * redirect, a 403, or nothing at all.
 */
async function expectNotFound(promise) {
  let digest;
  try {
    await promise;
  } catch (e) {
    digest = e?.digest;
  }
  expect(String(digest)).toMatch(/404/);
  expect(String(digest)).not.toMatch(/REDIRECT/);
}

function tokenResponse(body, { refresh = 'rt-value-123' } = {}) {
  const headers = {};
  if (refresh) {
    headers['Set-Cookie'] = `${REFRESH_COOKIE}=${refresh}; Path=/; Secure; HttpOnly; SameSite=Strict`;
  }
  return HttpResponse.json(body, { headers });
}

function stubLogin(box, body = { access_token: 'citizen-token' }, path = '/api/v1/auth/login') {
  server.use(
    http.post(API + path, async (info) => {
      await record(box)(info);
      return tokenResponse(body);
    }),
  );
}

// --- sign-in --------------------------------------------------------------

test('citizen login stores tokens server-side and marks the role', async () => {
  const box = {};
  stubLogin(box);
  await loginCitizen('12345678', 'pw');

  expect(box.json).toEqual({ login: '12345678', password: 'pw' });
  expect(await isAuthenticated()).toBe(true);
  expect(await isStaff()).toBe(false);
  expect((await getSession()).role).toBe('citizen');
});

test('the session never records citizen PII', async () => {
  stubLogin({}, { access_token: 'citizen-token', first_name: 'Amal', national_id: '12345678' });
  await loginCitizen('12345678', 'pw');

  // Even though the API echoed them back, none may be persisted (ADR-003).
  expect(Object.keys(await getSession()).sort()).toEqual([
    'access_token',
    'is_staff',
    'mfa_required',
    'refresh_token',
    'role',
  ]);
});

test('login rotates the session id, closing off session fixation', async () => {
  // An attacker plants a session id and knows its value.
  await setSession({ role: 'anonymous' });
  const planted = (await cookies()).get(SESSION_COOKIE).value;

  stubLogin({});
  await loginCitizen('12345678', 'pw');

  const after = (await cookies()).get(SESSION_COOKIE).value;
  expect(after).not.toBe(planted);
  // The planted id must not resolve to the now signed-in session.
  expect(redisStore().has(SESSION_PREFIX + planted)).toBe(false);
});

test('the refresh cookie is captured into the NEW session, not the discarded one', async () => {
  stubLogin({});
  await loginCitizen('12345678', 'pw');
  expect((await getSession()).refresh_token).toBe('rt-value-123');
});

test('a rejected credential raises rather than half-signing-in', async () => {
  server.use(
    http.post(API + '/api/v1/auth/login', () =>
      HttpResponse.json({ title: 'invalid_credentials' }, { status: 401 }),
    ),
  );
  await expect(loginCitizen('12345678', 'wrong')).rejects.toThrow(ApiError);
  expect(await isAuthenticated()).toBe(false);
});

test('staff login takes the role code from the API, not from the browser', async () => {
  const box = {};
  stubLogin(box, { access_token: 'staff-token' }, '/api/v1/auth/login/staff');
  await loginStaff('karim@watiq.tn', 'pw');

  expect(box.json).toEqual({ email: 'karim@watiq.tn', password: 'pw' });
  expect(await isStaff()).toBe(true);
  // From the GET /api/v1/staff/me fixture.
  expect(await role()).toBe('admin');
});

test('staff login falls back to the least privilege when /staff/me fails', async () => {
  stubLogin({}, { access_token: 'staff-token' }, '/api/v1/auth/login/staff');
  server.use(
    http.get(API + '/api/v1/staff/me', () => HttpResponse.json({ title: 'boom' }, { status: 503 })),
  );
  await loginStaff('karim@watiq.tn', 'pw');
  expect(await role()).toBe('staff');
});

test('mfa completion sends a bearer token and clears the partial flag', async () => {
  stubLogin({}, { access_token: 'partial-token', mfa_required: true }, '/api/v1/auth/login/staff');
  server.use(
    http.get(API + '/api/v1/staff/me', () => HttpResponse.json({ role_code: 'clerk' })),
  );
  await loginStaff('karim@watiq.tn', 'pw');
  expect((await getSession()).mfa_required).toBe(true);

  const box = {};
  server.use(
    http.post(API + '/api/v1/auth/mfa/complete', async (info) => {
      await record(box)(info);
      return tokenResponse({ access_token: 'full-token' }, { refresh: 'rt-after-mfa' });
    }),
  );
  await completeMfa('123456');

  expect(box.json).toEqual({ code: '123456' });
  expect(box.headers.get('authorization')).toBe('Bearer partial-token');

  const session = await getSession();
  expect(session.access_token).toBe('full-token');
  expect(session.mfa_required).toBe(false);
  // The rest of the session survives the rotation.
  expect(session.is_staff).toBe(true);
  expect(session.role).toBe('clerk');
  expect(session.refresh_token).toBe('rt-after-mfa');
});

// --- refresh --------------------------------------------------------------

test('refresh replays __Host-wtq_rt as an explicit Cookie header', async () => {
  await setSession({ access_token: 'stale', refresh_token: 'rt-value-123' });

  let cookieHeader;
  server.use(
    http.post(API + '/api/v1/auth/refresh', ({ request }) => {
      cookieHeader = request.headers.get('cookie');
      return tokenResponse({ access_token: 'fresh-token' }, { refresh: 'rt-rotated' });
    }),
  );

  expect(await refreshSession()).toBe(true);
  // The single detail the whole refresh flow hangs on.
  expect(cookieHeader).toBe(`${REFRESH_COOKIE}=rt-value-123`);

  const session = await getSession();
  expect(session.access_token).toBe('fresh-token');
  expect(session.refresh_token).toBe('rt-rotated');
});

test('refresh with no token is a no-op, not a request', async () => {
  await setSession({ access_token: 'stale' });
  expect(await refreshSession()).toBe(false);
  expect(SENT.filter((s) => s.path === '/api/v1/auth/refresh')).toHaveLength(0);
});

test('a rejected refresh token ends the session', async () => {
  await setSession({ access_token: 'stale', refresh_token: 'expired' });
  server.use(
    http.post(API + '/api/v1/auth/refresh', () =>
      HttpResponse.json({ title: 'invalid_token' }, { status: 401 }),
    ),
  );
  expect(await refreshSession()).toBe(false);
  expect(await getSession()).toEqual({});
});

test('an unreachable API leaves the session alone rather than signing everyone out', async () => {
  await setSession({ access_token: 'stale', refresh_token: 'rt-value-123' });
  server.use(http.post(API + '/api/v1/auth/refresh', () => HttpResponse.error()));

  expect(await refreshSession()).toBe(false);
  expect((await getSession()).refresh_token).toBe('rt-value-123');
});

test('a 401 on a normal call refreshes once and replays it', async () => {
  await setSession({ access_token: 'stale', refresh_token: 'rt-value-123' });

  let attempts = 0;
  server.use(
    http.get(API + '/api/v1/requests', () => {
      attempts += 1;
      return attempts === 1
        ? HttpResponse.json({ title: 'expired' }, { status: 401 })
        : HttpResponse.json({ items: [{ id: 11 }], total: 1 });
    }),
    http.post(API + '/api/v1/auth/refresh', () => tokenResponse({ access_token: 'fresh-token' })),
  );

  const { apiGet } = await import('@/lib/api.js');
  expect(await apiGet('/api/v1/requests')).toMatchObject({ total: 1 });
  expect(attempts).toBe(2);
});

test('a 401 that survives the refresh is not retried forever', async () => {
  await setSession({ access_token: 'stale', refresh_token: 'rt-value-123' });

  let attempts = 0;
  server.use(
    http.get(API + '/api/v1/requests', () => {
      attempts += 1;
      return HttpResponse.json({ title: 'expired' }, { status: 401 });
    }),
    http.post(API + '/api/v1/auth/refresh', () => tokenResponse({ access_token: 'fresh-token' })),
  );

  const { apiGet } = await import('@/lib/api.js');
  await expect(apiGet('/api/v1/requests')).rejects.toThrow(ApiError);
  expect(attempts).toBe(2);
});

// --- sign-out and profile -------------------------------------------------

test('logout revokes upstream then clears regardless', async () => {
  stubLogin({});
  await loginCitizen('12345678', 'pw');
  await logout();

  expect(SENT.at(-1).path).toBe('/api/v1/auth/logout');
  expect(await isAuthenticated()).toBe(false);
});

test('logout clears locally even when the revoke fails', async () => {
  stubLogin({});
  await loginCitizen('12345678', 'pw');
  server.use(http.post(API + '/api/v1/auth/logout', () => HttpResponse.error()));

  await logout();
  expect(await isAuthenticated()).toBe(false);
  expect((await cookies()).get(SESSION_COOKIE)).toBeUndefined();
});

test('currentProfile picks the endpoint that matches the session', async () => {
  expect(await currentProfile()).toBeNull();

  stubLogin({});
  await loginCitizen('12345678', 'pw');
  expect(await currentProfile()).toMatchObject({ first_name: 'Amal' });
  expect(SENT.at(-1).path).toBe('/api/v1/auth/me');

  stubLogin({}, { access_token: 'staff-token' }, '/api/v1/auth/login/staff');
  await loginStaff('karim@watiq.tn', 'pw');
  expect(await currentProfile()).toMatchObject({ name: 'Karim Trabelsi' });
  expect(SENT.at(-1).path).toBe('/api/v1/staff/me');
});

// --- guards ---------------------------------------------------------------

test('an anonymous visitor is redirected to sign in, with the path preserved', async () => {
  await expect(requireLogin('/requests/11')).rejects.toThrow(/NEXT_REDIRECT/);
  try {
    await requireLogin('/requests/11');
  } catch (e) {
    expect(e.digest).toContain('/login?next=%2Frequests%2F11&notice=signin_required');
  }
});

test('an anonymous visitor on a staff route gets the staff sign-in', async () => {
  try {
    await requireStaff('/staff');
  } catch (e) {
    expect(e.digest).toContain('staff=1');
  }
});

test('a signed-in citizen hitting a staff route gets 404, never 403', async () => {
  stubLogin({});
  await loginCitizen('12345678', 'pw');
  await expectNotFound(requireStaff('/staff'));
});

test('a clerk hitting an admin route gets 404, not 403', async () => {
  stubLogin({}, { access_token: 'staff-token' }, '/api/v1/auth/login/staff');
  server.use(http.get(API + '/api/v1/staff/me', () => HttpResponse.json({ role_code: 'clerk' })));
  await loginStaff('karim@watiq.tn', 'pw');

  await expect(requireStaff('/staff')).resolves.toBeUndefined();
  await expectNotFound(requireAdmin('/admin'));
});

test('an admin passes both guards', async () => {
  stubLogin({}, { access_token: 'staff-token' }, '/api/v1/auth/login/staff');
  await loginStaff('karim@watiq.tn', 'pw');

  await expect(requireStaff('/staff')).resolves.toBeUndefined();
  await expect(requireAdmin('/admin')).resolves.toBeUndefined();
});

// --- csrf -----------------------------------------------------------------

test('the csrf token is stable for the life of the session', async () => {
  await setSession({ access_token: 'tok' });
  const first = await issueCsrfToken();
  expect(first).toBe(await issueCsrfToken());
  expect(Buffer.from(first, 'base64url').length).toBeGreaterThanOrEqual(32);
});

test('a matching token passes and everything else fails', async () => {
  await setSession({ access_token: 'tok' });
  const token = await issueCsrfToken();

  const form = new FormData();
  form.set(CSRF_FIELD, token);
  await expect(assertCsrf(form)).resolves.toBeUndefined();

  const wrong = new FormData();
  wrong.set(CSRF_FIELD, 'x'.repeat(token.length));
  await expect(assertCsrf(wrong)).rejects.toThrow(CsrfError);

  await expect(assertCsrf(new FormData())).rejects.toThrow(CsrfError);
});

test('a session with no token issued rejects every submission', async () => {
  await setSession({ access_token: 'tok' });
  const form = new FormData();
  form.set(CSRF_FIELD, 'anything');
  await expect(assertCsrf(form)).rejects.toThrow(CsrfError);
});
