import { redirect } from 'next/navigation';
import { tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { formatDate } from '@/lib/view.js';
import { flash } from '@/lib/flash.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import { cancelAppointmentAction } from '@/lib/actions.js';
import '@/styles/pages/appointment_detail.css';

/**
 * One appointment.
 * Port of frontend_flask/templates/appointment_detail.html and
 * views/citizen.py:appointment_detail.
 *
 * The API publishes no GET /appointments/{id} — only the list, plus cancel and
 * status — so the row is picked out of the list the citizen can already see.
 * That keeps the authorisation exactly where it was: if it is not in their
 * list, it is not theirs to read.
 */

export const metadata = { title: 'Appointment | Watiq National Portal' };

export default async function AppointmentDetailPage({ params }) {
  const { id } = await params;
  await requireLogin(`/appointments/${id}`);
  const ctx = await pageContext();
  const { t } = ctx;

  const items = itemsOf(await tryGet('/api/v1/appointments', {}));
  const appointment = items.find((a) => String(a.id) === String(id));

  if (!appointment) {
    await flash(t('That appointment is not on your record.'), 'error');
    redirect('/appointments');
  }

  return (
    <PageShell active="appointments" {...ctx}>
      <nav aria-label={t('Breadcrumb')} className="font-label-sm text-label-sm text-on-surface-variant">
        <a className="hover:underline focus-ring rounded" href="/appointments">{t('Appointments')}</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{formatDate(appointment.slot_date)}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {appointment.service_name ?? t('Appointment')}
        </h1>
        <StatusBadge className="text-body-md px-4 py-2" status={appointment.status} />
      </header>

      <section className="bg-surface border border-outline-variant rounded-xl p-8 shadow-sm max-w-2xl space-y-6">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[
            [t('Date'), formatDate(appointment.slot_date)],
            [t('Time'), appointment.time_slot],
            [t('Office'), appointment.office_name],
            [t('Reference'), `#${appointment.id}`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                {label}
              </dt>
              <dd className="font-body-lg text-body-lg text-on-surface">{value || '—'}</dd>
            </div>
          ))}
        </dl>

        <div className="border-t border-outline-variant pt-6 space-y-4">
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('Bring your national identity card. Arrive ten minutes before the slot; a slot missed by more than fifteen minutes is released.')}
          </p>

          {String(appointment.status) === 'booked' && (
            <form action={cancelAppointmentAction}>
              <input name="appointment_id" type="hidden" value={appointment.id} />
              <button
                className="inline-flex items-center gap-2 border border-error text-error px-6 py-3 rounded font-label-md text-label-md hover:bg-error-container transition-colors focus-ring"
                type="submit"
              >
                <span aria-hidden="true" className="material-symbols-outlined">event_busy</span>
                {t('Cancel this appointment')}
              </button>
              <p className="mt-2 font-support-sm text-support-sm text-on-surface-variant">
                {t('The slot is released immediately and can be rebooked by anyone, including you.')}
              </p>
            </form>
          )}
        </div>
      </section>
    </PageShell>
  );
}
