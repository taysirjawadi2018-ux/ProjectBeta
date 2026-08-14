import { expect, test } from 'vitest';
import { cookies } from 'next/headers';
import {
  getSession,
  setSession,
  clearSession,
  rotateSession,
  SESSION_COOKIE,
  SESSION_PREFIX,
} from '@/lib/session.js';
import { redisStore, ttlOf, failNextCommand } from './mocks/ioredis.js';

test('a session round-trips without exposing tokens to the cookie', async () => {
  await setSession({ access_token: 'tok', is_staff: false, role: 'citizen' });
  expect(await getSession()).toMatchObject({ access_token: 'tok', role: 'citizen' });

  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE);
  expect(cookie.value).not.toContain('tok');
  expect(cookie.httpOnly).toBe(true);

  await clearSession();
  expect(await getSession()).toEqual({});
});

test('the cookie carries an opaque id and nothing else', async () => {
  await setSession({ access_token: 'tok', refresh_token: 'refresh-tok', role: 'citizen' });
  const cookie = (await cookies()).get(SESSION_COOKIE);

  // Not a JWT, not base64 of the payload, not anything decodable.
  expect(cookie.value).not.toContain('.');
  expect(cookie.value).not.toContain('refresh');
  expect(Buffer.from(cookie.value, 'base64url').length).toBeGreaterThanOrEqual(32);

  // The tokens live in the store, under the Flask key prefix.
  const keys = [...redisStore().keys()];
  expect(keys).toEqual([SESSION_PREFIX + cookie.value]);
  expect(JSON.parse(redisStore().get(keys[0]).value)).toMatchObject({
    access_token: 'tok',
    refresh_token: 'refresh-tok',
  });
});

test('the cookie is a browser-session cookie, matching SESSION_PERMANENT=False', async () => {
  await setSession({ role: 'citizen' });
  const cookie = (await cookies()).get(SESSION_COOKIE);

  // No maxAge and no expires: it dies with the browser. On a shared municipal
  // terminal a persistent cookie would hand the next person the session.
  expect(cookie.maxAge).toBeUndefined();
  expect(cookie.expires).toBeUndefined();
  expect(cookie.sameSite).toBe('lax');
  expect(cookie.path).toBe('/');

  // The server-side copy still expires on its own.
  expect(ttlOf(SESSION_PREFIX + cookie.value)).toBeGreaterThan(0);
});

test('setSession merges rather than replaces', async () => {
  await setSession({ access_token: 'tok', role: 'citizen' });
  await setSession({ mfa_required: true });
  expect(await getSession()).toMatchObject({
    access_token: 'tok',
    role: 'citizen',
    mfa_required: true,
  });
});

test('rotateSession issues a new id and drops the old record', async () => {
  await setSession({ role: 'anonymous', csrf_token: 'pre-login' });
  const before = (await cookies()).get(SESSION_COOKIE).value;

  await rotateSession({ access_token: 'tok', role: 'citizen' });
  const after = (await cookies()).get(SESSION_COOKIE).value;

  expect(after).not.toBe(before);
  // The pre-login id must not still resolve, or fixing the cookie before login
  // hands the attacker a session that is now signed in.
  expect(redisStore().has(SESSION_PREFIX + before)).toBe(false);
  // Rotation starts clean; it does not carry the old contents across.
  expect(await getSession()).toEqual({ access_token: 'tok', role: 'citizen' });
});

test('an unreadable store is an empty session, not a crash', async () => {
  await setSession({ access_token: 'tok' });
  failNextCommand();
  expect(await getSession()).toEqual({});
});

test('a cookie pointing at no record reads as signed out', async () => {
  await setSession({ access_token: 'tok' });
  const id = (await cookies()).get(SESSION_COOKIE).value;
  redisStore().delete(SESSION_PREFIX + id);
  expect(await getSession()).toEqual({});
});
