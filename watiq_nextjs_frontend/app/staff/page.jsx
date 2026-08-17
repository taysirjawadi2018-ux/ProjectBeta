import { tryGet } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf, totalOf } from '@/lib/format.js';
import { requireStaff } from '@/lib/guards.js';
import { getTranslator } from '@/lib/i18n.js';
import { role as sessionRole } from '@/lib/auth.js';
import { intOr, formatDate } from '@/lib/view.js';
import StaffShell from '@/components/StaffShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import Pagination from '@/components/Pagination.jsx';
import { assignRequestAction } from '@/lib/actions.js';
import '@/styles/pages/staff_workbench.css';

/**
 * The office queue.
 * Port of frontend_flask/templates/staff_workbench.html and
 * views/staff.py:workbench.
 */

export const generateMetadata = pageTitle('Workbench', { suffix: '| Watiq Back Office' });

const PAGE_SIZE = 25;

export default async function WorkbenchPage({ searchParams }) {
  await requireStaff('/staff');
  const params = await searchParams;
  const t = await getTranslator();

  const page = Math.max(1, intOr(params?.page, 1));

  const [queue, staff, permissionsData, appointments] = await Promise.all([
    tryGet('/api/v1/requests/office/queue', {}, { params: { page, size: PAGE_SIZE } }),
    tryGet('/api/v1/staff/me', null),
    tryGet('/api/v1/staff/me/permissions', {}),
    tryGet('/api/v1/appointments/office', []),
  ]);

  const items = itemsOf(queue);
  const total = totalOf(queue);
  const permissions = permissionsData?.permissions ?? [];
  const role = await sessionRole();

  return (
    <StaffShell active="workbench" role={role} staff={staff} t={t}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Workbench')}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {total} {total === 1 ? t('request in the queue') : t('requests in the queue')}
            {staff?.office_name ? ` · ${staff.office_name}` : ''}
          </p>
        </div>
        {permissions.includes('request.review') && (
          <a
            className="inline-flex items-center gap-2 bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
            href="/staff/review"
          >
            <span aria-hidden="true" className="material-symbols-outlined">fact_check</span>
            {t('Review the next item')}
          </a>
        )}
      </header>

      <section aria-labelledby="queue-heading">
        <h2 className="sr-only" id="queue-heading">{t('Request queue')}</h2>

        {items.length === 0 ? (
          <EmptyState icon="inbox" message={t('The queue is empty. Nothing is waiting for this office.')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface">
              <caption className="sr-only">{t('Requests waiting for this office')}</caption>
              <thead className="bg-surface-container-high">
                <tr>
                  {['Tracking code', 'Service', 'Status', 'Submitted', 'Assigned', ''].map((heading, index) => (
                    <th
                      key={heading || index}
                      className="text-start font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide px-4 py-3"
                      scope="col"
                    >
                      {heading ? t(heading) : <span className="sr-only">{t('Actions')}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-4">
                      <a
                        className="font-mono text-body-md text-on-surface font-bold hover:underline focus-ring rounded"
                        href={`/staff/review/${item.id}`}
                      >
                        {item.tracking_code}
                      </a>
                    </td>
                    <td className="px-4 py-4 font-body-md text-body-md text-on-surface">
                      {item.service_name ?? '—'}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={item.status_name} />
                    </td>
                    <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant whitespace-nowrap">
                      {formatDate(item.submitted_at)}
                    </td>
                    <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                      {item.assigned_staff_id ? `#${item.assigned_staff_id}` : t('Unassigned')}
                    </td>
                    <td className="px-4 py-4">
                      {permissions.includes('request.assign') && !item.assigned_staff_id && (
                        <form action={assignRequestAction}>
                          <input name="request_id" type="hidden" value={item.id} />
                          <button
                            className="inline-flex items-center gap-1 border border-outline-variant px-3 py-2 rounded font-label-sm text-label-sm hover:bg-surface-container-low transition-colors focus-ring whitespace-nowrap"
                            type="submit"
                          >
                            {t('Claim')}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination base="/staff" page={page} size={PAGE_SIZE} t={t} total={total} />
      </section>

      <section aria-labelledby="appointments-heading">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4" id="appointments-heading">
          {t("Today's appointments")}
        </h2>
        {itemsOf(appointments).length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('No appointments booked at this office.')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {itemsOf(appointments)
              .slice(0, 6)
              .map((item) => (
                <li key={item.id} className="bg-surface border border-outline-variant rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-body-md text-body-md text-on-surface font-bold">
                      {item.service_name ?? t('Appointment')}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">
                    {formatDate(item.slot_date)} · {item.time_slot}
                  </p>
                </li>
              ))}
          </ul>
        )}
        <a
          className="mt-4 inline-flex items-center gap-2 font-label-md text-label-md text-primary hover:underline focus-ring rounded"
          href="/staff/appointments"
        >
          {t('All appointments')}
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </a>
      </section>
    </StaffShell>
  );
}
