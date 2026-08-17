import { expect, test } from 'vitest';
import { cookies } from 'next/headers';
import { readPrefs, negotiate, LANGUAGES } from '@/lib/prefs.js';
import { flash, takeFlashes, noticeFor } from '@/lib/flash.js';
import { errorViewFor, designFor, TITLES } from '@/lib/errors.js';
import { ApiError } from '@/lib/api.js';
import { getSession, setSession } from '@/lib/session.js';
import { resetRequestScope } from './mocks/next-headers.js';

// --- preferences ----------------------------------------------------------

test('unrecognised cookie values fall back rather than being escaped', async () => {
  const jar = await cookies();
  jar.set('watiq_theme', 'dark"><script>');
  jar.set('watiq_text_scale', '999');
  jar.set('watiq_lang', 'zz');

  const prefs = await readPrefs();
  expect(prefs.theme).toBe('light');
  expect(prefs.textScale).toBe(100);
  expect(prefs.locale).toBe('en');
  // Nothing derived from the cookie reaches the class attribute.
  expect(prefs.themeClass).toBe('');
  expect(prefs.textScaleClass).toBe('');
});

test('recognised values are honoured', async () => {
  const jar = await cookies();
  jar.set('watiq_theme', 'dark');
  jar.set('watiq_text_scale', '150');
  jar.set('watiq_lang', 'ar');

  const prefs = await readPrefs();
  expect(prefs).toMatchObject({
    theme: 'dark',
    textScale: 150,
    locale: 'ar',
    dir: 'rtl',
    themeClass: 'dark',
    textScaleClass: 'text-scale-150',
  });
});

test('100% text scale emits no class, so the default costs nothing', async () => {
  (await cookies()).set('watiq_text_scale', '100');
  expect((await readPrefs()).textScaleClass).toBe('');
});

test('arabic is rtl and is offered last', () => {
  expect(LANGUAGES.ar.dir).toBe('rtl');
  expect(Object.keys(LANGUAGES)).toEqual(['en', 'fr', 'ar']);
});

test('an explicit choice beats the browser header', async () => {
  resetRequestScope({ headers: { 'accept-language': 'fr-FR,fr;q=0.9' } });
  (await cookies()).set('watiq_lang', 'ar');
  expect((await readPrefs()).locale).toBe('ar');
});

test('with no cookie the browser header decides', async () => {
  resetRequestScope({ headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' } });
  expect((await readPrefs()).locale).toBe('fr');
});

test('negotiation honours q-values rather than document order', () => {
  // Reading left to right would hand this reader French.
  expect(negotiate('fr;q=0.2, ar;q=0.9')).toBe('ar');
  expect(negotiate('de, ja, ar')).toBe('ar');
  expect(negotiate('de, ja')).toBe('en');
  expect(negotiate('')).toBe('en');
  expect(negotiate(null)).toBe('en');
  // q=0 means "not this one".
  expect(negotiate('ar;q=0, fr;q=0.5')).toBe('fr');
});

// --- flash ----------------------------------------------------------------

test('flashes are one-shot', async () => {
  await setSession({ access_token: 'tok' });
  await flash('Saved.', 'success');
  await flash('Careful.', 'warning');

  expect(await takeFlashes()).toEqual([
    { message: 'Saved.', category: 'success' },
    { message: 'Careful.', category: 'warning' },
  ]);
  expect(await takeFlashes()).toEqual([]);
  expect((await getSession()).flash).toEqual([]);
});

test('an unknown notice code renders nothing, so a URL cannot inject a message', () => {
  expect(noticeFor('signin_required')).toMatchObject({ category: 'info' });
  expect(noticeFor('<script>alert(1)</script>')).toBeNull();
  expect(noticeFor('')).toBeNull();
  expect(noticeFor(undefined)).toBeNull();
});

// --- error mapping --------------------------------------------------------

test('the three designs are selected by status, as error.html dispatched them', () => {
  expect(designFor(401)).toBe('blocked');
  expect(designFor(403)).toBe('blocked');
  expect(designFor(429)).toBe('blocked');
  expect(designFor(502)).toBe('maintenance');
  expect(designFor(503)).toBe('maintenance');
  expect(designFor(504)).toBe('maintenance');
  expect(designFor(404)).toBe('generic');
  expect(designFor(409)).toBe('generic');
});

test('a 401 clears the session so the next page does not repeat the dead refresh', async () => {
  await setSession({ access_token: 'tok', refresh_token: 'rt' });
  const view = await errorViewFor(new ApiError(401, 'expired'));

  expect(view).toMatchObject({ code: 401, title: TITLES[401], design: 'blocked' });
  expect(await getSession()).toEqual({});
});

test('an unrecognised status collapses to 502 rather than surfacing upstream numbers', async () => {
  expect(await errorViewFor(new ApiError(500, 'boom'))).toMatchObject({ code: 502 });
  expect(await errorViewFor(new ApiError(418, 'teapot'))).toMatchObject({ code: 502 });
});

test('404 stays plain and stays opaque', async () => {
  const view = await errorViewFor(new ApiError(404, 'not_found', 'Belongs to another user.'));
  expect(view).toMatchObject({
    code: 404,
    design: 'generic',
    message: 'Not found.',
  });
  expect(view.message).not.toContain('another user');
});

test('a transport failure is a maintenance 503, not a 500', async () => {
  const view = await errorViewFor(new TypeError('fetch failed'));
  expect(view).toMatchObject({ code: 503, design: 'maintenance' });
});
