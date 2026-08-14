import { expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { apiGet, apiPost, tryGet, ApiError, captureRefreshCookie, REFRESH_COOKIE } from '@/lib/api.js';
import { itemsOf, totalOf, displayName } from '@/lib/format.js';
import { getSession, setSession } from '@/lib/session.js';
import { SENT, server } from './setup.js';

test('sends a bearer token from the session and never in the URL', async () => {
  await setSession({ access_token: 'citizen-token' });
  const me = await apiGet('/api/v1/auth/me');

  expect(me.first_name).toBe('Amal');
  expect(SENT.at(-1).path).toBe('/api/v1/auth/me');
  expect(SENT.at(-1).params).toEqual({});
});

test('the access token goes in the Authorization header, not anywhere visible', async () => {
  await setSession({ access_token: 'citizen-token' });

  let seen;
  server.use(
    http.get('http://api:8000/api/v1/auth/me', ({ request }) => {
      seen = request;
      return HttpResponse.json({ first_name: 'Amal' });
    }),
  );
  await apiGet('/api/v1/auth/me');

  expect(seen.headers.get('authorization')).toBe('Bearer citizen-token');
  expect(seen.url).not.toContain('citizen-token');
});

test('an anonymous call sends no Authorization header at all', async () => {
  let seen;
  server.use(
    http.get('http://api:8000/api/v1/catalog/services', ({ request }) => {
      seen = request;
      return HttpResponse.json([]);
    }),
  );
  await apiGet('/api/v1/catalog/services', { auth: false });
  expect(seen.headers.get('authorization')).toBeNull();
});

test('404 does not leak the API detail to the citizen', async () => {
  server.use(
    http.get('http://api:8000/api/v1/requests/999', () =>
      HttpResponse.json(
        {
          type: 'about:blank',
          title: 'not_found',
          status: 404,
          // The shape of message Security.md §7.3 exists to keep off the screen.
          detail: 'Request 999 belongs to another user.',
          status_code: 404,
        },
        { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    ),
  );

  await expect(apiGet('/api/v1/requests/999')).rejects.toThrow(ApiError);
  try {
    await apiGet('/api/v1/requests/999');
  } catch (e) {
    expect(e.status).toBe(404);
    expect(e.userMessage()).toBe('Not found.');
    // The operator-facing detail is still on the error for the server log; it
    // is userMessage() that must not carry it.
    expect(e.userMessage()).not.toContain('another user');
  }
});

test('422 surfaces the field errors, flattened from FastAPI\'s list form', async () => {
  server.use(
    http.post('http://api:8000/api/v1/requests', () =>
      HttpResponse.json(
        {
          detail: [
            { loc: ['body', 'office_service_id'], msg: 'field required', type: 'missing' },
            { loc: ['body', 'form_data', 'full_name'], msg: 'too short', type: 'value_error' },
          ],
        },
        { status: 422 },
      ),
    ),
  );

  try {
    await apiPost('/api/v1/requests', { json: {} });
    throw new Error('should have thrown');
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect(e.userMessage()).toBe(
      'office_service_id: field required; form_data.full_name: too short',
    );
  }
});

test('an unmapped status falls back to the generic message', async () => {
  server.use(
    http.get('http://api:8000/api/v1/payments', () =>
      HttpResponse.json({ title: 'teapot' }, { status: 418 }),
    ),
  );
  try {
    await apiGet('/api/v1/payments');
  } catch (e) {
    expect(e.userMessage()).toBe('Something went wrong. Please try again.');
  }
});

test('isAuth covers 401 and 403 only', () => {
  expect(new ApiError(401).isAuth).toBe(true);
  expect(new ApiError(403).isAuth).toBe(true);
  expect(new ApiError(404).isAuth).toBe(false);
  expect(new ApiError(500).isAuth).toBe(false);
});

test('query params are serialised, and empty ones dropped', async () => {
  await apiGet('/api/v1/requests', {
    params: { status_id: 2, page: 1, q: '', missing: null, undef: undefined },
  });
  expect(SENT.at(-1).params).toEqual({ status_id: '2', page: '1' });
});

test('a JSON body is sent with the right content type', async () => {
  // Asserted off the intercepted request rather than SENT: a server.use()
  // override replaces the catch-all handler that records into SENT, so an
  // overridden path never appears there.
  let contentType;
  let sentBody;
  server.use(
    http.post('http://api:8000/api/v1/requests', async ({ request }) => {
      contentType = request.headers.get('content-type');
      sentBody = await request.clone().json();
      return HttpResponse.json({ id: 11 });
    }),
  );
  await apiPost('/api/v1/requests', { json: { office_service_id: 31 } });

  expect(contentType).toContain('application/json');
  expect(sentBody).toEqual({ office_service_id: 31 });
});

test('the default handler records the body into SENT', async () => {
  await apiPost('/api/v1/requests', { json: { office_service_id: 31 } });
  expect(SENT.at(-1)).toMatchObject({
    method: 'POST',
    path: '/api/v1/requests',
    json: { office_service_id: 31 },
  });
});

test('captureRefreshCookie stores the value and never the attributes', async () => {
  const response = new Response(null, {
    headers: {
      'Set-Cookie': `${REFRESH_COOKIE}=rt-value-123; Path=/; Secure; HttpOnly; SameSite=Strict`,
    },
  });
  await captureRefreshCookie(response);
  expect((await getSession()).refresh_token).toBe('rt-value-123');
});

test('captureRefreshCookie ignores every other cookie the API sets', async () => {
  const response = new Response(null, {
    headers: { 'Set-Cookie': 'other=nope; Path=/' },
  });
  await captureRefreshCookie(response);
  expect((await getSession()).refresh_token).toBeUndefined();
});

test('a 401 with retryAuth off surfaces rather than looping', async () => {
  await setSession({ access_token: 'stale' });
  server.use(
    http.get('http://api:8000/api/v1/auth/me', () =>
      HttpResponse.json({ title: 'unauthorized' }, { status: 401 }),
    ),
  );
  try {
    await apiGet('/api/v1/auth/me', { retryAuth: false });
    throw new Error('should have thrown');
  } catch (e) {
    expect(e.status).toBe(401);
    expect(e.userMessage()).toBe('Your session has expired. Please sign in again.');
  }
});

test('tryGet swallows the error so one dead panel does not blank the page', async () => {
  server.use(
    http.get('http://api:8000/api/v1/notifications', () =>
      HttpResponse.json({ title: 'boom' }, { status: 503 }),
    ),
  );
  expect(await tryGet('/api/v1/notifications', { items: [] })).toEqual({ items: [] });
});

test('tryGet also survives the API being unreachable, not just erroring', async () => {
  server.use(http.get('http://api:8000/api/v1/payments', () => HttpResponse.error()));
  expect(await tryGet('/api/v1/payments', [])).toEqual([]);
});

test('a 204 parses as null rather than throwing on an empty body', async () => {
  server.use(
    http.delete('http://api:8000/api/v1/appointments/4', () => new HttpResponse(null, { status: 204 })),
  );
  const { apiDelete } = await import('@/lib/api.js');
  expect(await apiDelete('/api/v1/appointments/4')).toBeNull();
});

test('itemsOf normalises both collection shapes', () => {
  expect(itemsOf([1, 2])).toEqual([1, 2]);
  expect(itemsOf({ items: [1], total: 1 })).toEqual([1]);
  expect(itemsOf({ nope: true })).toEqual([]);
  expect(itemsOf(null)).toEqual([]);
  expect(itemsOf('a string')).toEqual([]);
  expect(totalOf({ items: [1], total: 7 })).toBe(7);
  expect(totalOf([1, 2])).toBe(2);
  expect(totalOf({ items: [1] }, 99)).toBe(99);
});

test('displayName resolves both profile shapes', () => {
  expect(displayName({ name: 'Karim Trabelsi' })).toBe('Karim Trabelsi');
  expect(displayName({ first_name: 'Amal', last_name: 'Ben Salah' })).toBe('Amal Ben Salah');
  expect(displayName({ first_name: 'Amal' })).toBe('Amal');
  expect(displayName(null)).toBe('');
  expect(displayName({})).toBe('');
});
