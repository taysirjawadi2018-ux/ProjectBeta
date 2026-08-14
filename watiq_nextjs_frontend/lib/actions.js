'use server';

import { redirect } from 'next/navigation';
import { loginCitizen, loginStaff, completeMfa, logout } from './auth.js';
import { getSession } from './session.js';
import { flash } from './flash.js';
import { ApiError } from './api.js';

/**
 * The Server Actions the shared chrome and the auth forms post to.
 *
 * Every one of these is reachable as a plain <form action={...}> so the screens
 * work with JavaScript off, which the whole port is built around.
 *
 * They are the write half of the BFF and therefore the only place cookies may
 * be written — a Server Component render cannot issue one (see lib/session.js).
 */

/**
 * A `next` supplied by the browser, made safe.
 *
 * Must be a relative path and must not begin with '//', which a browser reads
 * as a protocol-relative URL to another origin. Without this the sign-in form
 * is an open redirect, and an open redirect on the sign-in form is a phishing
 * primitive: the link genuinely is the government portal until the moment it
 * bounces.
 */
export async function safeNext(raw, fallback = '/dashboard') {
  const target = String(raw || '');
  return target.startsWith('/') && !target.startsWith('//') ? target : fallback;
}

export async function logoutAction() {
  await logout();
  redirect('/login?notice=signed_out');
}

export async function loginAction(_prevState, formData) {
  const staffMode = formData.get('mode') === 'staff' || formData.get('staff') === '1';
  const identifier = String(formData.get('cin') || formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!identifier || !password) {
    return { error: 'Enter your credentials to continue.', staffMode };
  }

  try {
    if (staffMode) await loginStaff(identifier, password);
    else await loginCitizen(identifier, password);
  } catch (err) {
    // One message for every failure mode. Distinguishing "no such account" from
    // "wrong password" turns this form into an account enumerator.
    const generic = err instanceof ApiError && [400, 401, 404].includes(err.status);
    return {
      error: generic
        ? 'Those credentials were not recognised.'
        : (err instanceof ApiError ? err.userMessage() : 'Something went wrong. Please try again.'),
      staffMode,
    };
  }

  const session = await getSession();
  if (session.mfa_required) redirect('/login/mfa');
  if (session.is_staff) redirect('/staff');
  redirect(await safeNext(formData.get('next')));
}

export async function mfaAction(_prevState, formData) {
  // The design splits the code across six single-character boxes, all named
  // "code". Joining them means the form works with JavaScript disabled; a
  // single "code" field still works for anything that posts one.
  const parts = formData.getAll('code').map((p) => String(p).trim()).filter(Boolean);
  const code = parts.length > 1 ? parts.join('') : String(formData.get('code') || '').trim();

  try {
    await completeMfa(code);
  } catch (err) {
    const generic = err instanceof ApiError && [400, 401, 403, 404].includes(err.status);
    return {
      error: generic
        ? 'That code was not accepted.'
        : (err instanceof ApiError ? err.userMessage() : 'Something went wrong. Please try again.'),
    };
  }

  redirect('/staff');
}

/** Shared by the write forms: run it, flash the outcome, go somewhere. */
export async function submitAndRedirect(fn, { onSuccess, to }) {
  try {
    await fn();
  } catch (err) {
    await flash(
      err instanceof ApiError ? err.userMessage() : 'Something went wrong. Please try again.',
      'error',
    );
    return false;
  }
  if (onSuccess) await flash(onSuccess, 'success');
  if (to) redirect(to);
  return true;
}
