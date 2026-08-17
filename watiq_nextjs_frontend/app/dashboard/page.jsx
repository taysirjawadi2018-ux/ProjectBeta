import { tryGet } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf, displayName } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { formatDate } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import '@/styles/pages/citizen_dashboard.css';

/**
 * The citizen dashboard.
 * Port of frontend_flask/templates/citizen_dashboard.html and
 * views/citizen.py:dashboard.
 *
 * Every panel is a tryGet, so they degrade independently — one failing widget
 * must not blank the page. That matters more here than anywhere else: this is
 * the screen someone lands on after signing in, and a 500 here reads as "the
 * portal is down" even when only the notification feed is.
 */

export const generateMetadata = pageTitle('Your Space');

export default async function DashboardPage() {
  await requireLogin('/dashboard');
  const ctx = await pageContext();
  const { t, profile } = ctx;

  const [requestsData, appointmentsData, notificationsData] = await Promise.all([
    tryGet('/api/v1/requests', {}),
    tryGet('/api/v1/appointments', {}),
    tryGet('/api/v1/notifications', {}),
  ]);

  const requests = itemsOf(requestsData);
  const appointments = itemsOf(appointmentsData);
  const notifications = itemsOf(notificationsData).slice(0, 5);

  // There is no "all my documents" endpoint — documents are listed per request
  // — so the Recent Documents panel is assembled from the three most recent
  // requests. Bounded on purpose: this is a dashboard, not an archive.
  const documents = (
    await Promise.all(
      requests.slice(0, 3).map(async (item) => {
        const docs = itemsOf(await tryGet(`/api/v1/requests/${item.id}/documents`, []));
        return docs.map((document) => ({ ...document, request: item }));
      }),
    )
  )
    .flat()
    .slice(0, 4);

  const CARD = 'bg-surface border border-outline-variant rounded-xl p-6 shadow-sm';
  const HEADING = 'font-headline-md text-headline-md text-on-surface';

  return (
    <PageShell active="requests" {...ctx}>
      <header className="space-y-2">
        <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          {t('Your Space')}
        </p>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {profile ? `${t('Welcome')}, ${displayName(profile)}` : t('Welcome')}
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className={`${CARD} lg:col-span-2`} aria-labelledby="requests-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 className={HEADING} id="requests-heading">{t('Recent Requests')}</h2>
            <a className="font-label-md text-label-md text-primary hover:underline focus-ring rounded" href="/requests">
              {t('View all')}
            </a>
          </div>

          {requests.length === 0 ? (
            <EmptyState
              icon="description"
              message={t('You have not filed a request yet.')}
              action={{ href: '/services', label: t('Browse services') }}
            />
          ) : (
            <ul className="divide-y divide-outline-variant">
              {requests.slice(0, 4).map((item) => (
                <li key={item.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <a
                      className="font-body-md text-body-md text-on-surface font-bold hover:underline focus-ring rounded"
                      href={`/requests/${item.id}`}
                    >
                      {item.service_name ?? t('Request')}
                    </a>
                    <p className="font-mono text-support-sm text-on-surface-variant truncate">
                      {item.tracking_code}
                    </p>
                  </div>
                  <StatusBadge status={item.status_name} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={CARD} aria-labelledby="appointments-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 className={HEADING} id="appointments-heading">{t('Appointments')}</h2>
            <a className="font-label-md text-label-md text-primary hover:underline focus-ring rounded" href="/appointments">
              {t('View all')}
            </a>
          </div>

          {appointments.length === 0 ? (
            <EmptyState
              icon="event_available"
              message={t('Nothing booked.')}
              action={{ href: '/appointments/book', label: t('Book an appointment') }}
            />
          ) : (
            <ul className="space-y-3">
              {appointments.slice(0, 3).map((item) => (
                <li key={item.id} className="bg-surface-container-low rounded-lg p-4">
                  <a
                    className="font-body-md text-body-md text-on-surface font-bold hover:underline focus-ring rounded"
                    href={`/appointments/${item.id}`}
                  >
                    {item.service_name ?? t('Appointment')}
                  </a>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">
                    {formatDate(item.slot_date)} · {item.time_slot}
                  </p>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">
                    {item.office_name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD} lg:col-span-2`} aria-labelledby="documents-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 className={HEADING} id="documents-heading">{t('Recent Documents')}</h2>
            <a className="font-label-md text-label-md text-primary hover:underline focus-ring rounded" href="/documents">
              {t('View all')}
            </a>
          </div>

          {documents.length === 0 ? (
            <EmptyState icon="folder_open" message={t('No documents uploaded yet.')} />
          ) : (
            <ul className="divide-y divide-outline-variant">
              {documents.map((document) => (
                <li key={`${document.request.id}-${document.id}`} className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <a
                      className="font-body-md text-body-md text-on-surface font-bold hover:underline focus-ring rounded"
                      href={`/requests/${document.request.id}/documents/${document.id}`}
                    >
                      {document.document_type ?? t('Document')}
                    </a>
                    <p className="font-support-sm text-support-sm text-on-surface-variant truncate">
                      {document.request.tracking_code}
                    </p>
                  </div>
                  <StatusBadge status={document.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={CARD} aria-labelledby="notifications-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 className={HEADING} id="notifications-heading">{t('Notifications')}</h2>
            <a className="font-label-md text-label-md text-primary hover:underline focus-ring rounded" href="/notifications">
              {t('View all')}
            </a>
          </div>

          {notifications.length === 0 ? (
            <EmptyState icon="notifications_none" message={t('Nothing new.')} />
          ) : (
            <ul className="space-y-3">
              {notifications.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg p-4 ${item.is_read ? 'bg-surface-container-low' : 'bg-tertiary-container'}`}
                >
                  <p className="font-body-md text-body-md text-on-surface font-bold">{item.title}</p>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">{item.message}</p>
                  <p className="font-support-sm text-support-sm text-on-surface-variant mt-1">
                    {formatDate(item.created_at, { withTime: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="actions-heading">
        <h2 className={`${HEADING} mb-4`} id="actions-heading">{t('Quick actions')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['/requests/new', 'note_add', 'File a request'],
            ['/appointments/book', 'event_available', 'Book an appointment'],
            ['/documents', 'folder', 'My documents'],
            ['/security-log', 'shield', 'Security log'],
          ].map(([href, icon, label]) => (
            <a
              key={href}
              className="bg-surface border border-outline-variant rounded-xl p-6 flex flex-col gap-3 hover:bg-primary-container hover:text-on-primary transition-colors focus-ring"
              href={href}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[28px]">{icon}</span>
              <span className="font-label-md text-label-md">{t(label)}</span>
            </a>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
