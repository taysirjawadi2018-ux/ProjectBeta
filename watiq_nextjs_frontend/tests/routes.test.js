import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { render } from './render.js';
import { server } from './setup.js';
import { setSession } from '@/lib/session.js';

/**
 * Every route renders, and the guards actually guard.
 * Port of frontend_flask/tests/test_routes.py.
 *
 * Rendering each screen against the fixtures is what catches a component
 * reading a field the API does not send: the page still "works" in a browser
 * pointed at a live API only because the value happens to be there, and it
 * renders an empty cell forever if it is not.
 */

// Pages are imported statically. A dynamic import on a computed path defeats
// Vite's analysis and the whole table silently resolves to nothing.
import PortalIndex from '@/app/page.jsx';
import LoginPage from '@/app/login/page.jsx';
import MfaPage from '@/app/login/mfa/page.jsx';
import RegisterPage from '@/app/register/page.jsx';
import PasswordResetPage from '@/app/password-reset/page.jsx';
import ServicesPage from '@/app/services/page.jsx';
import TrackPage from '@/app/track/page.jsx';
import HelpPage from '@/app/help/page.jsx';
import ContactPage from '@/app/contact/page.jsx';
import SupportChatPage from '@/app/support/chat/page.jsx';
import TermsPage from '@/app/legal/terms/page.jsx';
import PrivacyPage from '@/app/legal/privacy/page.jsx';
import AccessibilityPage from '@/app/accessibility/page.jsx';
import AboutPage from '@/app/about/page.jsx';
import OpenDataPage from '@/app/open-data/page.jsx';
import StatusPage from '@/app/status/page.jsx';
import BlockedPage from '@/app/blocked/page.jsx';

import DashboardPage from '@/app/dashboard/page.jsx';
import RequestsPage from '@/app/requests/page.jsx';
import RequestDetailPage from '@/app/requests/[id]/page.jsx';
import SubmitRequestPage from '@/app/requests/new/page.jsx';
import UploadPage from '@/app/requests/[id]/documents/new/page.jsx';
import DocumentDetailPage from '@/app/requests/[id]/documents/[documentId]/page.jsx';
import DocumentsPage from '@/app/documents/page.jsx';
import SecurityLogPage from '@/app/security-log/page.jsx';
import AppointmentsPage from '@/app/appointments/page.jsx';
import BookAppointmentPage from '@/app/appointments/book/page.jsx';
import AppointmentDetailPage from '@/app/appointments/[id]/page.jsx';
import NotificationsPage from '@/app/notifications/page.jsx';
import PaymentsPage from '@/app/payments/page.jsx';
import PaymentConfirmationPage from '@/app/payments/confirmation/page.jsx';
import ProfilePage from '@/app/profile/page.jsx';

import WorkbenchPage from '@/app/staff/page.jsx';
import ReviewNextPage from '@/app/staff/review/page.jsx';
import ReviewPage from '@/app/staff/review/[id]/page.jsx';
import StaffAppointmentsPage from '@/app/staff/appointments/page.jsx';
import AuditPage from '@/app/staff/audit/page.jsx';
import HealthPage from '@/app/staff/health/page.jsx';
import AdminPage from '@/app/admin/page.jsx';

const API = 'http://api:8000';

/** Next 15 hands both of these to a page as promises. */
const props = (searchParams = {}, params = {}) => ({
  searchParams: Promise.resolve(searchParams),
  params: Promise.resolve(params),
});

async function citizen() {
  await setSession({
    access_token: 'citizen-token',
    refresh_token: 'citizen-refresh',
    is_staff: false,
    role: 'citizen',
  });
}

async function admin() {
  await setSession({
    access_token: 'staff-token',
    refresh_token: 'staff-refresh',
    is_staff: true,
    role: 'admin',
  });
}

async function clerk() {
  await setSession({
    access_token: 'clerk-token',
    refresh_token: 'clerk-refresh',
    is_staff: true,
    role: 'clerk',
  });
}

/** The thrown control-flow signal a guard raises, or undefined if it did not. */
async function digestOf(promise) {
  try {
    await promise;
  } catch (err) {
    return String(err?.digest ?? '');
  }
  return undefined;
}

// --- public ---------------------------------------------------------------

const PUBLIC_GETS = [
  ['/', PortalIndex, props()],
  ['/login', LoginPage, props()],
  ['/login?staff=1', LoginPage, props({ staff: '1' })],
  ['/register', RegisterPage, props()],
  ['/services', ServicesPage, props()],
  ['/services?q=birth', ServicesPage, props({ q: 'birth' })],
  ['/services?category=civil', ServicesPage, props({ category: 'civil' })],
  ['/services?delivery=digital', ServicesPage, props({ delivery: 'digital' })],
  ['/services?q=nothingmatchesthis', ServicesPage, props({ q: 'nothingmatchesthis' })],
  ['/track', TrackPage, props()],
  ['/track?code=WTQ-2026-000011', TrackPage, props({ code: 'WTQ-2026-000011' })],
  ['/legal/privacy', PrivacyPage, props()],
  ['/legal/terms', TermsPage, props()],
  ['/accessibility', AccessibilityPage, props()],
  ['/contact', ContactPage, props()],
  ['/about', AboutPage, props()],
  ['/open-data', OpenDataPage, props()],
  ['/password-reset', PasswordResetPage, props()],
  ['/password-reset?stage=confirm', PasswordResetPage, props({ stage: 'confirm' })],
  // The second mockup drop split /help off support.html into its own knowledge
  // base and gave live chat a route; both filter on the query string, so the
  // filtered and empty forms are covered too.
  ['/help', HelpPage, props()],
  ['/help?topic=Payments', HelpPage, props({ topic: 'Payments' })],
  ['/help?q=receipt', HelpPage, props({ q: 'receipt' })],
  ['/help?q=nothingmatchesthis', HelpPage, props({ q: 'nothingmatchesthis' })],
  ['/support/chat', SupportChatPage, props()],
  ['/status', StatusPage, props()],
  ['/blocked', BlockedPage, props()],
  ['/blocked?code=429&reason=rate_limited', BlockedPage, props({ code: '429', reason: 'rate_limited' })],
];

describe('public pages render signed out', () => {
  test.each(PUBLIC_GETS)('%s', async (_path, Page, pageProps) => {
    const html = await render(Page, pageProps);
    expect(html.length).toBeGreaterThan(200);
  });
});

// --- citizen --------------------------------------------------------------

const CITIZEN_GETS = [
  ['/dashboard', DashboardPage, props()],
  ['/requests', RequestsPage, props()],
  ['/requests/11', RequestDetailPage, props({}, { id: '11' })],
  ['/requests/new', SubmitRequestPage, props()],
  // /requests/new only renders the office_service_id field once an office is
  // chosen, so the second form of the page needs covering too.
  ['/requests/new?office_id=1', SubmitRequestPage, props({ office_id: '1' })],
  ['/appointments', AppointmentsPage, props()],
  ['/appointments/4', AppointmentDetailPage, props({}, { id: '4' })],
  // The booking wizard is three server-rendered steps selected by the query
  // string: office list, then that office's slots, then the confirmation.
  ['/appointments/book', BookAppointmentPage, props()],
  ['/appointments/book?office_id=1', BookAppointmentPage, props({ office_id: '1' })],
  [
    '/appointments/book?office_id=1&slot_date=2026-08-10',
    BookAppointmentPage,
    props({ office_id: '1', slot_date: '2026-08-10' }),
  ],
  [
    '/appointments/book?office_id=1&slot_date=2026-08-10&slot_id=21',
    BookAppointmentPage,
    props({ office_id: '1', slot_date: '2026-08-10', slot_id: '21' }),
  ],
  ['/notifications', NotificationsPage, props()],
  ['/payments', PaymentsPage, props()],
  ['/payments/confirmation', PaymentConfirmationPage, props()],
  ['/payments/confirmation?id=9', PaymentConfirmationPage, props({ id: '9' })],
  ['/profile', ProfilePage, props()],
  ['/documents', DocumentsPage, props()],
  ['/documents?status=verified', DocumentsPage, props({ status: 'verified' })],
  ['/documents?status=pending', DocumentsPage, props({ status: 'pending' })],
  ['/requests/11/documents/3', DocumentDetailPage, props({}, { id: '11', documentId: '3' })],
  ['/requests/11/documents/new', UploadPage, props({}, { id: '11' })],
  ['/security-log', SecurityLogPage, props()],
];

describe('citizen pages render for a signed-in citizen', () => {
  test.each(CITIZEN_GETS)('%s', async (_path, Page, pageProps) => {
    await citizen();
    const html = await render(Page, pageProps);
    expect(html.length).toBeGreaterThan(200);
  });
});

describe('citizen pages require sign-in', () => {
  test.each(CITIZEN_GETS)('%s redirects', async (_path, Page, pageProps) => {
    const digest = await digestOf(render(Page, pageProps));
    expect(digest).toContain('NEXT_REDIRECT');
    expect(digest).toContain('/login');
  });
});

// --- staff ----------------------------------------------------------------

const STAFF_GETS = [
  ['/staff', WorkbenchPage, props()],
  ['/staff/review', ReviewNextPage, props()],
  ['/staff/review/11', ReviewPage, props({}, { id: '11' })],
  ['/staff/appointments', StaffAppointmentsPage, props()],
  ['/staff/audit', AuditPage, props()],
  ['/staff/health', HealthPage, props()],
];

describe('staff pages render for staff', () => {
  test.each(STAFF_GETS)('%s', async (_path, Page, pageProps) => {
    await admin();
    const html = await render(Page, pageProps);
    expect(html.length).toBeGreaterThan(200);
  });
});

describe('admin tabs render', () => {
  test.each(['users', 'staff', 'roles'])('/admin?tab=%s', async (tab) => {
    await admin();
    const html = await render(AdminPage, props({ tab }));
    expect(html).toContain('Administration');
  });
});

test('an unknown admin tab falls back rather than rendering nothing', async () => {
  await admin();
  const html = await render(AdminPage, props({ tab: '<script>' }));
  expect(html).toContain('Administration');
  expect(html).not.toContain('<script>alert');
});

// --- guards ---------------------------------------------------------------

describe('the staff area is 404 for a citizen, never 403', () => {
  // A 403 confirms the route exists; Security.md §7.3 makes the API answer 404
  // for exactly this reason, and the UI must not undo it.
  test.each(STAFF_GETS)('%s', async (_path, Page, pageProps) => {
    await citizen();
    const digest = await digestOf(render(Page, pageProps));
    expect(digest).toMatch(/404/);
    expect(digest).not.toMatch(/REDIRECT/);
  });
});

test('the admin area is 404 for a citizen', async () => {
  await citizen();
  expect(await digestOf(render(AdminPage, props()))).toMatch(/404/);
});

test('the admin area is 404 for non-admin staff', async () => {
  await clerk();
  expect(await digestOf(render(AdminPage, props()))).toMatch(/404/);
});

test('a clerk still reaches the staff area', async () => {
  await clerk();
  const html = await render(WorkbenchPage, props());
  expect(html.length).toBeGreaterThan(200);
});

test('the staff area sends an anonymous visitor to the staff sign-in', async () => {
  const digest = await digestOf(render(WorkbenchPage, props()));
  expect(digest).toContain('NEXT_REDIRECT');
  expect(digest).toContain('staff=1');
});

// --- the failure modes the Flask suite was written for ---------------------

test('review survives an empty queue', async () => {
  // A clerk who has cleared the queue must not get a 500. /staff/review with no
  // id shows the next item; with an empty queue there is no item, and the
  // decision form used to build a URL with request_id=None.
  await clerk();
  server.use(
    http.get(`${API}/api/v1/requests/office/queue`, () => HttpResponse.json({ items: [], total: 0 })),
  );
  const html = await render(ReviewNextPage, props());
  expect(html).toContain('queue is clear');
});

test('a request that is not yours renders the error screen, not a crash', async () => {
  await citizen();
  server.use(
    http.get(`${API}/api/v1/requests/9999`, () =>
      HttpResponse.json(
        { title: 'not_found', status: 404, detail: 'Belongs to another user.' },
        { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    ),
  );
  const html = await render(RequestDetailPage, props({}, { id: '9999' }));
  expect(html).toContain('Not found.');
  // The operator-facing detail must not reach the citizen.
  expect(html).not.toContain('another user');
});

test('a document not on the request redirects rather than 500ing', async () => {
  await citizen();
  const digest = await digestOf(render(DocumentDetailPage, props({}, { id: '11', documentId: '9999' })));
  expect(digest).toContain('NEXT_REDIRECT');
  expect(digest).toContain('/documents');
});

test('an appointment not on your record redirects rather than 500ing', async () => {
  await citizen();
  const digest = await digestOf(render(AppointmentDetailPage, props({}, { id: '9999' })));
  expect(digest).toContain('NEXT_REDIRECT');
  expect(digest).toContain('/appointments');
});

test('an unreachable API degrades the dashboard rather than blanking it', async () => {
  await citizen();
  server.use(http.get(`${API}/api/v1/*`, () => HttpResponse.error()));
  const html = await render(DashboardPage, props());
  // Every panel is a tryGet, so the page still renders its shell and empty
  // states rather than throwing — this is the screen someone lands on after
  // signing in, and a 500 here reads as "the portal is down".
  expect(html).toContain('Quick actions');
});

test('a signed-in visitor is bounced off the sign-in form', async () => {
  await citizen();
  const digest = await digestOf(render(LoginPage, props()));
  expect(digest).toContain('NEXT_REDIRECT');
  expect(digest).toContain('/dashboard');
});

test('MFA needs a session to step up from', async () => {
  const digest = await digestOf(render(MfaPage, props()));
  expect(digest).toContain('NEXT_REDIRECT');
  expect(digest).toContain('staff=1');
});

test('the blocked screen refuses a forged status and reason', async () => {
  const html = await render(
    BlockedPage,
    props({ code: '200', reason: '<script>alert(1)</script>' }),
  );
  // Falls back to 403 and the standard copy rather than rendering either.
  expect(html).toContain('Access Restricted');
  expect(html).not.toContain('alert(1)');
});
