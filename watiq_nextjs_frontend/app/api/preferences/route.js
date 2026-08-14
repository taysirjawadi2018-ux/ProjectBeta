import { NextResponse } from 'next/server';
import {
  LANGUAGES,
  LANG_COOKIE,
  PREF_MAX_AGE,
  THEMES,
  THEME_COOKIE,
  TEXT_SCALES,
  TEXT_SCALE_COOKIE,
} from '@/lib/prefs.js';
import { IS_DEV } from '@/lib/config.js';

/**
 * Persist the reader's theme / text-size / language choice.
 * Port of frontend_flask/views/public.py:403-451.
 *
 * The floating controls are a real form posting here, so they work with
 * JavaScript off — the whole point of the text-size control is that it reaches
 * people who are least likely to be on a current browser. The client script
 * intercepts the submit and applies the change in place; this is what happens
 * when it cannot.
 *
 * A year-long cookie rather than the session: the preference has to survive
 * signing out, and it is not a secret. httpOnly is deliberately false — the
 * client script reads it to keep the controls in sync.
 */

/**
 * Same relative-path rule as the sign-in `next`, but landing on the portal
 * rather than the dashboard: this route is reachable signed out, and bouncing
 * an anonymous reader to a login screen for changing the text size would be a
 * strange answer to the request.
 *
 * The '//' check is the one that matters — '//evil.example' is a
 * protocol-relative URL, and a browser treats it as another origin.
 */
function safeTarget(raw) {
  const target = String(raw || '');
  return target.startsWith('/') && !target.startsWith('//') ? target : '/';
}

export async function POST(request) {
  const form = await request.formData();

  // 303: the response to a POST is a resource to GET, and without it a browser
  // repeats the POST on reload.
  const response = NextResponse.redirect(
    new URL(safeTarget(form.get('next')), request.url),
    303,
  );

  const options = {
    maxAge: PREF_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
    secure: !IS_DEV,
    path: '/',
  };

  const theme = String(form.get('theme') ?? '');
  if (THEMES.includes(theme)) response.cookies.set(THEME_COOKIE, theme, options);

  const scale = String(form.get('text_scale') ?? '');
  if (/^\d+$/.test(scale) && TEXT_SCALES.includes(Number(scale))) {
    response.cookies.set(TEXT_SCALE_COOKIE, scale, options);
  }

  const lang = String(form.get('lang') ?? '');
  if (Object.hasOwn(LANGUAGES, lang)) response.cookies.set(LANG_COOKIE, lang, options);

  return response;
}
