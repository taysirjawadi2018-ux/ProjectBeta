import { expect, test } from 'vitest';
import { SENT } from './setup.js';
import { fixtureJson } from './fixtures.js';

test('msw intercepts and records', async () => {
  const resp = await fetch('http://api:8000/api/v1/auth/me');
  expect(await resp.json()).toMatchObject({ first_name: 'Amal' });
  expect(SENT.at(-1)).toMatchObject({ method: 'GET', path: '/api/v1/auth/me' });
});

test('records the request body and query string, not just the path', async () => {
  await fetch('http://api:8000/api/v1/requests?status_id=2&page=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ office_service_id: 31 }),
  });
  expect(SENT.at(-1)).toEqual({
    method: 'POST',
    path: '/api/v1/requests',
    params: { status_id: '2', page: '1' },
    json: { office_service_id: 31 },
  });
});

test('an unknown read is a problem+json 404, the shape the API returns', async () => {
  const resp = await fetch('http://api:8000/api/v1/requests/9999');
  expect(resp.status).toBe(404);
  expect(resp.headers.get('content-type')).toContain('application/problem+json');
  expect(await resp.json()).toMatchObject({ title: 'not_found', status: 404 });
});

test('SENT is cleared between tests', () => {
  expect(SENT).toHaveLength(0);
});

test('fixtureJson hands out a copy, so a mutating test cannot leak', () => {
  const a = fixtureJson('GET /api/v1/auth/me');
  a.first_name = 'MUTATED';
  expect(fixtureJson('GET /api/v1/auth/me').first_name).toBe('Amal');
});
