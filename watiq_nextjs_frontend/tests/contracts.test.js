import { expect, test } from 'vitest';
import { render } from './render.js';
import { SENT } from './setup.js';
import { setSession } from '@/lib/session.js';
import {
  bookAppointmentAction,
  setRequestStatusAction,
  verifyDocumentAction,
  assignRequestAction,
  setAppointmentStatusAction,
  submitRequestAction,
  updateRolePermissionsAction,
  anonymizeUserAction,
} from '@/lib/actions.js';
import BookAppointmentPage from '@/app/appointments/book/page.jsx';
import NotificationsPage from '@/app/notifications/page.jsx';
import DashboardPage from '@/app/dashboard/page.jsx';

/**
 * What the BFF sends upstream must match the API's request models.
 * Port of frontend_flask/tests/test_api_contracts.py.
 *
 * Rendering tests cannot catch a payload the API rejects: the page still
 * returns 200 and the failure only appears when a real person presses the
 * button. Each of these guards a field name that was wrong, where the API
 * declares extra="forbid" and would answer 422 for every submission.
 */

/**
 * A date the wizard will not clamp. The page pins slot_date to today at the
 * earliest — the API has no slots in the past — so a hardcoded date silently
 * rots into the past and the assertion starts failing on a calendar, not a
 * change in behaviour.
 */
const futureDay = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

const props = (searchParams = {}, params = {}) => ({
  searchParams: Promise.resolve(searchParams),
  params: Promise.resolve(params),
});

function form(fields) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  return data;
}

function calls(method, path) {
  return SENT.filter((c) => c.method === method && c.path === path);
}

/** Actions signal completion by throwing a redirect; that is not a failure. */
async function act(promise) {
  try {
    await promise;
  } catch (err) {
    if (!String(err?.digest ?? '').startsWith('NEXT_REDIRECT')) throw err;
  }
}

async function citizen() {
  await setSession({ access_token: 'citizen-token', is_staff: false, role: 'citizen' });
}

async function admin() {
  await setSession({ access_token: 'staff-token', is_staff: true, role: 'admin' });
}

// --- appointments ---------------------------------------------------------

test('booking sends slot_id and office_service_id, and nothing else', async () => {
  await citizen();
  // AppointmentCreateIn requires office_service_id as well as slot_id, and
  // forbids extras — office_id is ours, not the API's.
  await act(bookAppointmentAction(null, form({ slot_id: '21', office_service_id: '31', office_id: '1' })));

  const posted = calls('POST', '/api/v1/appointments');
  expect(posted).toHaveLength(1);
  expect(posted[0].json).toEqual({ slot_id: 21, office_service_id: 31 });
});

test('a reason is sent only when one was written, and is capped', async () => {
  await citizen();
  await act(bookAppointmentAction(null, form({ slot_id: '21', office_service_id: '31', reason: '  ' })));
  expect(calls('POST', '/api/v1/appointments')[0].json).toEqual({
    slot_id: 21,
    office_service_id: 31,
  });

  SENT.length = 0;
  await act(
    bookAppointmentAction(null, form({ slot_id: '21', office_service_id: '31', reason: 'x'.repeat(3000) })),
  );
  expect(calls('POST', '/api/v1/appointments')[0].json.reason).toHaveLength(2000);
});

test('booking without a service never reaches the API', async () => {
  await citizen();
  await act(bookAppointmentAction(null, form({ slot_id: '21', office_id: '1' })));
  expect(calls('POST', '/api/v1/appointments')).toHaveLength(0);
});

test('slots are requested with office and date', async () => {
  await citizen();
  // GET /appointments/slots declares office_id and slot_date as required;
  // sending neither answered 422 on every load, so no slot ever appeared.
  await render(BookAppointmentPage, props({ office_id: '1', slot_date: futureDay }));

  const asked = calls('GET', '/api/v1/appointments/slots');
  expect(asked).toHaveLength(1);
  expect(asked[0].params).toEqual({ office_id: '1', slot_date: futureDay });
});

test('slots are not requested before an office is chosen', async () => {
  await citizen();
  await render(BookAppointmentPage, props());
  expect(calls('GET', '/api/v1/appointments/slots')).toHaveLength(0);
});

test('the confirmation step names the service the slot is reserved for', async () => {
  await citizen();
  // The lookup joins SlotOut.office_service_id to the office_services rows; if
  // the two drift apart the page silently degrades to a generic label.
  const html = await render(
    BookAppointmentPage,
    props({ office_id: '1', slot_date: futureDay, slot_id: '21' }),
  );
  expect(html).toContain('Birth Certificate');
  expect(html).toMatch(/name="office_service_id"[\s\S]{0,400}value="31"/);
});

// --- staff decisions ------------------------------------------------------

test('a status decision sends a status code, not an id', async () => {
  await admin();
  // StatusUpdateIn takes new_status_code (a code), not a status_id.
  await act(
    setRequestStatusAction(form({ request_id: '11', status_code: 'approved', reason: 'Documents check out.' })),
  );

  const patched = calls('PATCH', '/api/v1/requests/11/status');
  expect(patched).toHaveLength(1);
  expect(patched[0].json).toEqual({
    new_status_code: 'approved',
    reason: 'Documents check out.',
  });
});

test('an unknown status code is refused locally', async () => {
  await admin();
  await act(setRequestStatusAction(form({ request_id: '11', status_code: 'not_a_status' })));
  expect(calls('PATCH', '/api/v1/requests/11/status')).toHaveLength(0);
});

test('document verification sends a status literal', async () => {
  await admin();
  // VerifyIn takes status: "verified" | "rejected".
  await act(verifyDocumentAction(form({ document_id: '3', decision: 'accept' })));
  expect(calls('PATCH', '/api/v1/documents/3/verify')[0].json).toEqual({ status: 'verified' });

  SENT.length = 0;
  await act(verifyDocumentAction(form({ document_id: '3', decision: 'reject' })));
  expect(calls('PATCH', '/api/v1/documents/3/verify')[0].json).toEqual({ status: 'rejected' });
});

test('assign sends no body', async () => {
  await admin();
  // The endpoint assigns to the calling officer and derives the staff id from
  // the session, so a staff_id from the browser would be both ignored and a
  // privilege question we should not be asking the client.
  await act(assignRequestAction(form({ request_id: '11', staff_id: '99' })));

  const patched = calls('PATCH', '/api/v1/requests/11/assign');
  expect(patched).toHaveLength(1);
  expect(patched[0].json).toBeNull();
});

test('appointment status is restricted to the allowed values', async () => {
  await admin();
  await act(setAppointmentStatusAction(form({ appointment_id: '4', status: 'cancelled' })));
  expect(calls('PATCH', '/api/v1/appointments/4/status')).toHaveLength(0);

  SENT.length = 0;
  await act(setAppointmentStatusAction(form({ appointment_id: '4', status: 'no_show' })));
  expect(calls('PATCH', '/api/v1/appointments/4/status')[0].json).toEqual({ status: 'no_show' });
});

// --- requests -------------------------------------------------------------

test('a new request sends an office_service_id, and control fields stay out of form_data', async () => {
  await citizen();
  // RequestCreateIn requires office_service_id; control fields must not leak
  // into form_data, which is stored verbatim as the citizen's answers.
  await act(
    submitRequestAction(
      null,
      form({
        office_service_id: '31',
        office_id: '1',
        cin: '12345678',
        finalite: 'Dossier de recrutement',
      }),
    ),
  );

  const posted = calls('POST', '/api/v1/requests');
  expect(posted).toHaveLength(1);
  expect(posted[0].json).toEqual({
    office_service_id: 31,
    form_data: { cin: '12345678', finalite: 'Dossier de recrutement' },
  });
});

test("a Server Action's own fields never reach form_data", async () => {
  await citizen();
  // React posts internal keys alongside the form's; sending them upstream
  // would store framework noise as the citizen's answers.
  const data = form({ office_service_id: '31', cin: '12345678' });
  data.set('$ACTION_ID_abc123', 'x');
  data.set('$ACTION_REF_1', 'y');
  await act(submitRequestAction(null, data));

  expect(calls('POST', '/api/v1/requests')[0].json.form_data).toEqual({ cin: '12345678' });
});

test('a request without a service never reaches the API', async () => {
  await citizen();
  const result = await submitRequestAction(null, form({ office_id: '1' }));
  expect(result.error).toMatch(/Choose a service/);
  expect(calls('POST', '/api/v1/requests')).toHaveLength(0);
});

// --- notifications --------------------------------------------------------

test('notifications pass the cursor through', async () => {
  await citizen();
  await render(NotificationsPage, props({ cursor: 'abc123' }));

  const asked = calls('GET', '/api/v1/notifications');
  expect(asked).toHaveLength(1);
  expect(asked[0].params).toEqual({ cursor: 'abc123' });
});

test('the unread badge reads unread_count, not count', async () => {
  await citizen();
  // GET /notifications/unread-count answers {"unread_count": n}. Reading
  // "count" made the badge permanently 0, so the element never rendered.
  const html = await render(DashboardPage, props());
  expect(html).toContain('2 unread');
});

// --- admin ----------------------------------------------------------------

test('role permissions are sent as a whole set', async () => {
  await admin();
  // The PATCH replaces the set rather than merging, which is why the editor
  // renders every permission — an unrendered one would be silently revoked.
  const data = new FormData();
  data.set('role_id', '1');
  data.append('permission', 'request.review');
  data.append('permission', 'request.assign');
  await act(updateRolePermissionsAction(data));

  expect(calls('PATCH', '/api/v1/admin/roles/1/permissions')[0].json).toEqual({
    permissions: ['request.review', 'request.assign'],
  });
});

test('erasure needs both guards before it reaches the API', async () => {
  await admin();

  // Wrong national ID.
  await act(
    anonymizeUserAction(
      form({ user_id: '1', confirm_national_id: '00000000', expected_national_id: '12345678', blobs_purged: 'yes' }),
    ),
  );
  expect(calls('POST', '/api/v1/admin/users/1/anonymize')).toHaveLength(0);

  // Right ID, but the purge was not confirmed. Order matters:
  // fn_anonymize_user() severs the link to the blobs, orphaning anything left.
  SENT.length = 0;
  await act(
    anonymizeUserAction(
      form({ user_id: '1', confirm_national_id: '12345678', expected_national_id: '12345678' }),
    ),
  );
  expect(calls('POST', '/api/v1/admin/users/1/anonymize')).toHaveLength(0);

  // Both guards satisfied.
  SENT.length = 0;
  await act(
    anonymizeUserAction(
      form({ user_id: '1', confirm_national_id: '12345678', expected_national_id: '12345678', blobs_purged: 'yes' }),
    ),
  );
  expect(calls('POST', '/api/v1/admin/users/1/anonymize')).toHaveLength(1);
});
