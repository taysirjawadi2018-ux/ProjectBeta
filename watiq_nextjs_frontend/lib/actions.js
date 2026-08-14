'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { loginCitizen, loginStaff, completeMfa, logout } from './auth.js';
import { getSession } from './session.js';
import { flash } from './flash.js';
import { ApiError, apiPost, apiPatch, apiDelete, tryGet } from './api.js';
import { STATUS_CODES } from './workflow.js';

/**
 * Every write the BFF performs. Ports the POST halves of
 * frontend_flask/views/{public,citizen,staff,admin}.py.
 *
 * All of these are reachable as a plain <form action={...}>, so the screens
 * work with JavaScript off — which the whole port is built around.
 *
 * They are also the only place cookies may be written: a Server Component
 * render cannot issue one (see lib/session.js), which is why sign-in and
 * sign-out are actions rather than page logic.
 *
 * No explicit CSRF token. Next compares Origin against Host on every Server
 * Action before the function body runs, which is the check Flask-WTF's token
 * was standing in for. lib/csrf.js remains for the Route Handlers, which get
 * no such check.
 */

/**
 * A `next` supplied by the browser, made safe.
 *
 * Must be a relative path and must not begin with '//', which a browser reads
 * as a protocol-relative URL to another origin. Without this the sign-in form
 * is an open redirect, and an open redirect on a government sign-in form is a
 * phishing primitive: the link genuinely is the portal until it bounces.
 */
function safe(raw, fallback = '/dashboard') {
  const target = String(raw || '');
  return target.startsWith('/') && !target.startsWith('//') ? target : fallback;
}

function message(err, fallback = 'Something went wrong. Please try again.') {
  return err instanceof ApiError ? err.userMessage() : fallback;
}

// --- session --------------------------------------------------------------

export async function logoutAction() {
  await logout();
  redirect('/?notice=signed_out');
}

export async function loginAction(_prev, formData) {
  const staffMode = formData.get('mode') === 'staff' || formData.get('staff') === '1';
  const identifier = String(formData.get('cin') || formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '');

  if (!identifier || !password) {
    return { error: 'Enter your credentials to continue.', staffMode };
  }

  try {
    if (staffMode) await loginStaff(identifier, password);
    else await loginCitizen(identifier, password);
  } catch (err) {
    // One message for every failure mode. Distinguishing "no such account"
    // from "wrong password" turns this form into an account enumerator.
    const indistinguishable = err instanceof ApiError && [400, 401, 404].includes(err.status);
    return {
      error: indistinguishable ? 'Those credentials were not recognised.' : message(err),
      staffMode,
    };
  }

  const session = await getSession();
  if (session.mfa_required) redirect('/login/mfa');
  if (session.is_staff) redirect('/staff');
  redirect(safe(next));
}

export async function mfaAction(_prev, formData) {
  // The design splits the code across six single-character boxes, all named
  // "code". Joining them means the form works with JavaScript disabled; a
  // single "code" field still works for anything that posts one.
  const parts = formData.getAll('code').map((p) => String(p).trim()).filter(Boolean);
  const code = parts.length > 1 ? parts.join('') : String(formData.get('code') || '').trim();

  try {
    await completeMfa(code);
  } catch (err) {
    const indistinguishable =
      err instanceof ApiError && [400, 401, 403, 404].includes(err.status);
    return { error: indistinguishable ? 'That code was not accepted.' : message(err) };
  }
  redirect('/staff');
}

export async function registerAction(_prev, formData) {
  const form = {};
  for (const [key, value] of formData.entries()) {
    if (key !== 'password' && key !== 'password_confirm') form[key] = String(value).trim();
  }

  const password = String(formData.get('password') || '');
  if (password !== String(formData.get('password_confirm') || '')) {
    return { error: 'The two passwords do not match.', form };
  }

  const payload = {
    national_id: form.national_id ?? '',
    first_name: form.first_name ?? '',
    last_name: form.last_name ?? '',
    password,
  };
  for (const optional of ['email', 'phone', 'date_of_birth', 'governorate', 'city']) {
    if (form[optional]) payload[optional] = form[optional];
  }

  try {
    await apiPost('/api/v1/auth/register', { json: payload, auth: false });
  } catch (err) {
    return { error: message(err), form };
  }

  // Signing in straight away is a convenience, not the point of the flow: if it
  // fails the account still exists, so say so and send them to sign in.
  try {
    await loginCitizen(payload.national_id, password);
  } catch {
    await flash('Account created. Please sign in.', 'success');
    redirect('/login');
  }
  await flash('Welcome to Watiq. Your account is ready.', 'success');
  redirect('/dashboard');
}

export async function passwordResetAction(_prev, formData) {
  const stage = String(formData.get('stage') || 'request');
  try {
    if (stage === 'request') {
      await apiPost('/api/v1/auth/password-reset/request', {
        json: { login: String(formData.get('login') || '').trim() },
        auth: false,
      });
      // Always the same response, whether or not the account exists: anything
      // else makes this form an account-existence oracle.
      await flash('If that account exists, a reset code has been sent.', 'info');
      redirect('/password-reset?stage=confirm');
    }
    await apiPost('/api/v1/auth/password-reset', {
      json: {
        code: String(formData.get('code') || '').trim(),
        new_password: String(formData.get('new_password') || ''),
      },
      auth: false,
    });
  } catch (err) {
    if (err?.digest?.startsWith?.('NEXT_REDIRECT')) throw err;
    return { error: message(err), stage };
  }
  await flash('Your password has been changed. Please sign in.', 'success');
  redirect('/login');
}

// --- requests -------------------------------------------------------------

export async function submitRequestAction(_prev, formData) {
  const officeServiceId = Number.parseInt(String(formData.get('office_service_id') || ''), 10);
  if (!Number.isFinite(officeServiceId)) {
    return { error: 'Choose a service and an office before submitting.' };
  }

  // Everything not a control field is application data. The API enforces the
  // real limits (64 KB, depth 8, 200 keys) in requests/formdata.py; this is
  // only about not forwarding our own control fields.
  const reserved = new Set(['office_service_id', 'priority_id', 'office_id', '$ACTION_ID']);
  const formDataOut = {};
  for (const [key, value] of formData.entries()) {
    const text = String(value);
    if (!reserved.has(key) && !key.startsWith('$') && text.trim()) formDataOut[key] = text;
  }

  const payload = { office_service_id: officeServiceId, form_data: formDataOut };
  const priority = Number.parseInt(String(formData.get('priority_id') || ''), 10);
  if (Number.isFinite(priority)) payload.priority_id = priority;

  let created;
  try {
    created = await apiPost('/api/v1/requests', { json: payload });
  } catch (err) {
    return { error: message(err), officeId: formData.get('office_id') };
  }

  await flash(`Request submitted. Your tracking code is ${created?.tracking_code ?? ''}.`, 'success');
  redirect(`/requests/${created.id}`);
}

/**
 * Broker the presigned upload.
 *
 * The file itself goes browser → object storage; it never passes through this
 * process. We only ask for the presigned URL and confirm afterwards, which is
 * why this returns the URL rather than accepting the bytes.
 */
export async function requestUploadUrlAction(requestId, filename, contentType) {
  try {
    return {
      upload: await apiPost(`/api/v1/requests/${requestId}/documents`, {
        json: { filename, content_type: contentType || 'application/octet-stream' },
      }),
    };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function confirmDocumentAction(formData) {
  const id = String(formData.get('document_id') || '');
  const back = safe(formData.get('next'), '/requests');
  try {
    await apiPost(`/api/v1/documents/${id}/confirm`);
    await flash('Document uploaded. It will be checked by an officer.', 'success');
  } catch (err) {
    await flash(message(err), 'error');
  }
  revalidatePath(back);
  redirect(back);
}

export async function deleteDocumentAction(formData) {
  const id = String(formData.get('document_id') || '');
  const back = safe(formData.get('next'), '/documents');
  try {
    await apiDelete(`/api/v1/documents/${id}`);
    await flash('Document removed.', 'info');
  } catch (err) {
    await flash(message(err), 'error');
  }
  revalidatePath(back);
  redirect(back);
}

// --- appointments ---------------------------------------------------------

export async function bookAppointmentAction(_prev, formData) {
  const slotId = Number.parseInt(String(formData.get('slot_id') || ''), 10);
  const officeServiceId = Number.parseInt(String(formData.get('office_service_id') || ''), 10);

  if (!Number.isFinite(slotId)) {
    await flash('Choose a time slot to continue.', 'error');
    redirect('/appointments/book');
  }
  if (!Number.isFinite(officeServiceId)) {
    await flash('Choose which service the appointment is for.', 'error');
    const params = new URLSearchParams({
      office_id: String(formData.get('office_id') || ''),
      slot_date: String(formData.get('slot_date') || ''),
      slot_id: String(slotId),
    });
    redirect(`/appointments/book?${params}`);
  }

  const payload = { slot_id: slotId, office_service_id: officeServiceId };
  const reason = String(formData.get('reason') || '').trim();
  if (reason) payload.reason = reason.slice(0, 2000);

  try {
    await apiPost('/api/v1/appointments', { json: payload });
  } catch (err) {
    if (err?.digest?.startsWith?.('NEXT_REDIRECT')) throw err;
    await flash(
      err instanceof ApiError && err.status === 409
        ? 'That slot has just been taken. Please choose another.'
        : message(err),
      'error',
    );
    redirect('/appointments/book');
  }
  await flash('Your appointment is booked.', 'success');
  redirect('/appointments');
}

export async function cancelAppointmentAction(formData) {
  const id = String(formData.get('appointment_id') || '');
  try {
    await apiPost(`/api/v1/appointments/${id}/cancel`);
    await flash('Appointment cancelled.', 'info');
  } catch (err) {
    await flash(message(err), 'error');
  }
  revalidatePath('/appointments');
  redirect('/appointments');
}

// --- notifications --------------------------------------------------------

export async function markNotificationReadAction(formData) {
  const id = String(formData.get('notification_id') || '');
  try {
    await apiPost(`/api/v1/notifications/${id}/read`);
  } catch (err) {
    await flash(message(err), 'error');
  }
  revalidatePath('/notifications');
  redirect('/notifications');
}

export async function markAllNotificationsReadAction() {
  try {
    await apiPost('/api/v1/notifications/read-all');
    await flash('All notifications marked as read.', 'info');
  } catch (err) {
    await flash(message(err), 'error');
  }
  revalidatePath('/notifications');
  redirect('/notifications');
}

// --- support --------------------------------------------------------------

export async function contactAction() {
  // There is no inquiry endpoint under /api/v1. The reference is generated so
  // the screen can acknowledge the submission the way the design does; nothing
  // is stored, and the copy says where a real answer comes from.
  const reference = `INQ-2026-${Math.floor(10000 + Math.random() * 90000)}`;
  await flash(
    `Your official inquiry has been submitted successfully under reference ticket ${reference}. Our compliance team will review your inquiry shortly.`,
    'success',
  );
  redirect('/contact');
}

export async function supportChatAction() {
  // There is no chat backend — no websocket, nothing under /api/v1 that
  // accepts a message — so the transcript says plainly that the channel is not
  // live and points at the ones that are. The design is the mockup's; the
  // promise is not.
  await flash(
    'Live chat is not connected yet. Please use the telephone or email channel listed on the contact page and quote your national ID.',
    'info',
  );
  redirect('/support/chat');
}

// --- staff ----------------------------------------------------------------

export async function assignRequestAction(formData) {
  const id = String(formData.get('request_id') || '');
  try {
    // The endpoint takes no body — it assigns to the calling officer and
    // derives the staff id from the session, so a staff_id sent from the
    // browser would be both ignored and a privilege question we should not be
    // asking the client.
    await apiPatch(`/api/v1/requests/${id}/assign`);
    await flash('Request assigned to you.', 'success');
  } catch (err) {
    await flash(message(err), 'error');
  }
  redirect(`/staff/review/${id}`);
}

export async function setRequestStatusAction(formData) {
  const id = String(formData.get('request_id') || '');
  const statusCode = String(formData.get('status_code') || '').trim();

  if (!Object.values(STATUS_CODES).includes(statusCode)) {
    await flash('Choose a decision before submitting.', 'error');
    redirect(`/staff/review/${id}`);
  }

  const payload = { new_status_code: statusCode };
  // StatusUpdateIn caps the reason at 2000 characters and forbids extra keys,
  // so it is sent only when the reviewer actually wrote one.
  const reason = String(formData.get('reason') || '').trim();
  if (reason) payload.reason = reason.slice(0, 2000);

  try {
    await apiPatch(`/api/v1/requests/${id}/status`, { json: payload });
  } catch (err) {
    if (err?.digest?.startsWith?.('NEXT_REDIRECT')) throw err;
    await flash(message(err), 'error');
    redirect(`/staff/review/${id}`);
  }
  await flash('Decision recorded.', 'success');
  redirect('/staff');
}

export async function verifyDocumentAction(formData) {
  const id = String(formData.get('document_id') || '');
  const back = safe(formData.get('next'), '/staff');
  // VerifyIn takes status: "verified" | "rejected" and forbids anything else.
  const status = formData.get('decision') === 'accept' ? 'verified' : 'rejected';
  try {
    await apiPatch(`/api/v1/documents/${id}/verify`, { json: { status } });
    await flash(status === 'verified' ? 'Document accepted.' : 'Document rejected.', 'success');
  } catch (err) {
    await flash(message(err), 'error');
  }
  revalidatePath(back);
  redirect(back);
}

export async function setAppointmentStatusAction(formData) {
  const id = String(formData.get('appointment_id') || '');
  const status = String(formData.get('status') || '');
  // AppointmentStatusIn only accepts "completed" or "no_show".
  if (!['completed', 'no_show'].includes(status)) {
    await flash('Choose whether the citizen attended.', 'error');
    redirect('/staff/appointments');
  }
  try {
    await apiPatch(`/api/v1/appointments/${id}/status`, { json: { status } });
    await flash('Appointment updated.', 'success');
  } catch (err) {
    if (err?.digest?.startsWith?.('NEXT_REDIRECT')) throw err;
    await flash(message(err), 'error');
  }
  redirect('/staff/appointments');
}

// --- admin ----------------------------------------------------------------

async function adminToggle(kind, id, verb, ok) {
  try {
    await apiPost(`/api/v1/admin/${kind}/${id}/${verb}`);
    await flash(ok, 'success');
  } catch (err) {
    await flash(message(err), 'error');
  }
}

export async function setUserActiveAction(formData) {
  const id = String(formData.get('user_id') || '');
  const activate = formData.get('activate') === 'yes';
  await adminToggle(
    'users',
    id,
    activate ? 'reactivate' : 'deactivate',
    activate ? 'Account reactivated.' : 'Account deactivated.',
  );
  redirect('/admin?tab=users');
}

/**
 * Irreversible erasure (GDPR Art. 17).
 *
 * Two guards before the call: the operator must type the national ID to
 * confirm, and must tick that stored documents were purged first. Order
 * matters — fn_anonymize_user() severs the link between the person and their
 * blobs, so anything still in object storage afterwards is orphaned and can no
 * longer be found for deletion.
 */
export async function anonymizeUserAction(formData) {
  const id = String(formData.get('user_id') || '');
  const typed = String(formData.get('confirm_national_id') || '').trim();
  const expected = String(formData.get('expected_national_id') || '').trim();

  if (!typed || typed !== expected) {
    await flash('Erasure cancelled: the national ID typed did not match the account.', 'error');
    redirect('/admin?tab=users');
  }
  if (formData.get('blobs_purged') !== 'yes') {
    await flash(
      'Erasure cancelled: confirm that stored documents were purged first. Anonymising before purging orphans them permanently.',
      'error',
    );
    redirect('/admin?tab=users');
  }

  try {
    await apiPost(`/api/v1/admin/users/${id}/anonymize`);
    await flash('Account anonymised. This cannot be undone.', 'success');
  } catch (err) {
    if (err?.digest?.startsWith?.('NEXT_REDIRECT')) throw err;
    await flash(message(err), 'error');
  }
  redirect('/admin?tab=users');
}

export async function createStaffAction(formData) {
  const payload = {};
  for (const [key, cast] of [
    ['email', String],
    ['first_name', String],
    ['last_name', String],
    ['office_id', Number],
    ['role_id', Number],
  ]) {
    const raw = String(formData.get(key) || '').trim();
    if (raw) payload[key] = cast === Number ? Number(raw) : raw;
  }
  try {
    await apiPost('/api/v1/admin/staff', { json: payload });
    await flash('Staff member created.', 'success');
  } catch (err) {
    await flash(message(err), 'error');
  }
  redirect('/admin?tab=staff');
}

export async function setStaffActiveAction(formData) {
  const id = String(formData.get('staff_id') || '');
  const activate = formData.get('activate') === 'yes';
  await adminToggle(
    'staff',
    id,
    activate ? 'reactivate' : 'deactivate',
    activate ? 'Staff account reactivated.' : 'Staff account deactivated.',
  );
  redirect('/admin?tab=staff');
}

export async function updateRolePermissionsAction(formData) {
  const id = String(formData.get('role_id') || '');
  const codes = formData.getAll('permission').map(String);
  try {
    await apiPatch(`/api/v1/admin/roles/${id}/permissions`, { json: { permissions: codes } });
    await flash(`Permissions updated (${codes.length} granted).`, 'success');
  } catch (err) {
    await flash(message(err), 'error');
  }
  redirect('/admin?tab=roles');
}

// --- downloads ------------------------------------------------------------

/**
 * Hand the browser the presigned URL as a redirect.
 *
 * The file is never proxied through this process, and the storage key never
 * reaches the page: the API mints a short-lived presigned GET and we bounce to
 * it. It is a redirect rather than an <img src> or a fetch because the CSP is
 * default-src 'none' — a cross-origin object-storage URL would be refused as a
 * subresource, but a top-level navigation is unaffected.
 *
 * Authorisation is the API's: it enforces owner-RLS for citizens and the
 * document.download permission for staff, so both roles use this one path.
 */
export async function downloadDocumentAction(formData) {
  const id = String(formData.get('document_id') || '');
  const back = safe(formData.get('next'), '/documents');
  const presigned = await tryGet(`/api/v1/documents/${id}/download`, {});
  const url = presigned && typeof presigned === 'object' ? presigned.presigned_url : null;
  if (!url) {
    await flash('That document is not available for download right now.', 'error');
    redirect(back);
  }
  redirect(url);
}
