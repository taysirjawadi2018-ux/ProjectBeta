import { tryGet } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf } from '@/lib/format.js';
import { requireStaff } from '@/lib/guards.js';
import { getTranslator } from '@/lib/i18n.js';
import { role as sessionRole } from '@/lib/auth.js';
import { formatDate } from '@/lib/view.js';
import StaffShell from '@/components/StaffShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import { setAppointmentStatusAction } from '@/lib/actions.js';

/**
 * The office's appointment book.
 * Port of frontend_flask/templates/staff_appointments.html and
 * views/staff.py:office_appointments.
 */

export const generateMetadata = pageTitle('Appointments', { suffix: '| Watiq Back Office' });

export default async function StaffAppointmentsPage() {
  await requireStaff('/staff/appointments');
  const t = await getTranslator();
  const role = await sessionRole();

  const [appointments, staff] = await Promise.all([
    tryGet('/api/v1/appointments/office', []),
    tryGet('/api/v1/staff/me', null),
  ]);

  const items = itemsOf(appointments);

  return (
    <StaffShell active="appointments" role={role} staff={staff} t={t}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Appointments')}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {items.length} {items.length === 1 ? t('appointment') : t('appointments')}
          {staff?.office_name ? ` · ${staff.office_name}` : ''}
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState icon="event_busy" message={t('No appointments booked at this office.')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface">
            <caption className="sr-only">{t('Appointments at this office')}</caption>
            <thead className="bg-surface-container-high">
              <tr>
                {['Date', 'Time', 'Service', 'Status', 'Attendance'].map((heading) => (
                  <th
                    key={heading}
                    className="text-start font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide px-4 py-3"
                    scope="col"
                  >
                    {t(heading)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface whitespace-nowrap">
                    {formatDate(item.slot_date)}
                  </td>
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface whitespace-nowrap">
                    {item.time_slot}
                  </td>
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface">
                    {item.service_name ?? '—'}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-4">
                    {/* AppointmentStatusIn only accepts "completed" or
                        "no_show", so those are the only two offered — and only
                        while the booking is still live. */}
                    {String(item.status) === 'booked' ? (
                      <div className="flex flex-wrap gap-2">
                        {[
                          ['completed', 'Attended', 'bg-secondary-container text-on-secondary-container border-secondary'],
                          ['no_show', 'Did not attend', 'border-outline-variant text-on-surface'],
                        ].map(([status, label, classes]) => (
                          <form action={setAppointmentStatusAction} key={status}>
                            <input name="appointment_id" type="hidden" value={item.id} />
                            <input name="status" type="hidden" value={status} />
                            <button
                              className={`inline-flex items-center gap-1 border px-3 py-2 rounded font-label-sm text-label-sm hover:shadow transition-all focus-ring whitespace-nowrap ${classes}`}
                              type="submit"
                            >
                              {t(label)}
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : (
                      <span className="font-support-sm text-support-sm text-on-surface-variant">
                        {t('Recorded')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StaffShell>
  );
}
