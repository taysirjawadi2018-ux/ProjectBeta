import { tryGet } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { formatDate } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import { cancelAppointmentAction } from '@/lib/actions.js';
import '@/styles/pages/appointment_detail.css';

/** Port of frontend_flask/templates/appointments.html and views/citizen.py:appointments. */

export const generateMetadata = pageTitle('Appointments');

export default async function AppointmentsPage() {
  await requireLogin('/appointments');
  const ctx = await pageContext();
  const { t } = ctx;

  const appointments = itemsOf(await tryGet('/api/v1/appointments', {}));

  return (
    <PageShell active="appointments" {...ctx}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Appointments')}</h1>
        <a
          className="inline-flex items-center gap-2 bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
          href="/appointments/book"
        >
          <span aria-hidden="true" className="material-symbols-outlined">event_available</span>
          {t('Book an appointment')}
        </a>
      </header>

      {appointments.length === 0 ? (
        <EmptyState
          icon="event_busy"
          message={t('You have no appointments booked.')}
          action={{ href: '/appointments/book', label: t('Book an appointment') }}
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {appointments.map((item) => (
            <li
              key={item.id}
              className="bg-surface border border-outline-variant rounded-xl p-6 flex flex-col gap-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <a
                  className="font-headline-md text-headline-md text-on-surface hover:underline focus-ring rounded"
                  href={`/appointments/${item.id}`}
                >
                  {item.service_name ?? t('Appointment')}
                </a>
                <StatusBadge status={item.status} />
              </div>

              <dl className="grid grid-cols-2 gap-3 font-body-md text-body-md">
                <div>
                  <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                    {t('Date')}
                  </dt>
                  <dd className="text-on-surface">{formatDate(item.slot_date)}</dd>
                </div>
                <div>
                  <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                    {t('Time')}
                  </dt>
                  <dd className="text-on-surface">{item.time_slot}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                    {t('Office')}
                  </dt>
                  <dd className="text-on-surface">{item.office_name ?? '—'}</dd>
                </div>
              </dl>

              {/* Only a live booking can be cancelled; a completed or already
                  cancelled one has nothing to release. */}
              {String(item.status) === 'booked' && (
                <form action={cancelAppointmentAction} className="mt-auto pt-2">
                  <input name="appointment_id" type="hidden" value={item.id} />
                  <button
                    className="inline-flex items-center gap-2 border border-error text-error px-4 py-2 rounded font-label-sm text-label-sm hover:bg-error-container transition-colors focus-ring"
                    type="submit"
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">event_busy</span>
                    {t('Cancel')}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
