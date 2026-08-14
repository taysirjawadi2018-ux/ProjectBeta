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
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  SENT.push({
    method: request.method,
    path: url.pathname,
    params: Object.fromEntries(url.searchParams),
    json: body,
  });

  if (key in FIXTURES) return HttpResponse.json(FIXTURES[key]);

  // Writes get a generic success. The fixtures deliberately cover reads only:
  // what a write test asserts on is the payload recorded in SENT, not the
  // response, and giving every write its own fixture would mean rewriting the
  // fixture file every time a form gains a field.
  if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return HttpResponse.json({ id: 11, tracking_code: 'WTQ-2026-000011' });
  }

  // RFC 9457, the shape the API actually returns — the client's error handling
  // is parsed against this, so a plain {"error": ...} here would let a broken
  // parser pass.
  return HttpResponse.json(
    { type: 'about:blank', title: 'not_found', status: 404, detail: 'No such resource.' },
    { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
  );
};

// The BFF talks to the API over the compose network name. Anything that
// escapes to another host is a bug in the code under test, which is what
// onUnhandledRequest: 'error' below turns into a failure rather than a
// real outbound request.
export const server = setupServer(http.all('http://api:8000/*', handler));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  SENT.length = 0;
});
afterAll(() => server.close());
