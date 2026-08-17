import { tryGet } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf, totalOf } from '@/lib/format.js';
import { requireStaff } from '@/lib/guards.js';
import { getTranslator } from '@/lib/i18n.js';
import { role as sessionRole } from '@/lib/auth.js';
import { intOr, formatDate } from '@/lib/view.js';
import StaffShell from '@/components/StaffShell.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import Pagination from '@/components/Pagination.jsx';
import '@/styles/pages/staff_audit.css';

/**
 * Access log.
 * Port of frontend_flask/templates/staff_audit.html and views/staff.py:audit.
 *
 * The API applies the real authorisation — a clerk without the audit permission
 * gets a 403 from it. tryGet turns that into the empty state rather than an
 * error page, which is the honest rendering: the screen exists, this account
 * cannot read it.
 */

export const generateMetadata = pageTitle('Access Log', { suffix: '| Watiq Back Office' });

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }) {
  await requireStaff('/staff/audit');
  const params = await searchParams;
  const t = await getTranslator();
  const role = await sessionRole();

  const page = Math.max(1, intOr(params?.page, 1));

  const [data, staff] = await Promise.all([
    tryGet('/api/v1/audit/access-log', {}, { params: { page, size: PAGE_SIZE } }),
    tryGet('/api/v1/staff/me', null),
  ]);

  const entries = itemsOf(data);
  const total = totalOf(data);

  return (
    <StaffShell active="audit" role={role} staff={staff} t={t}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Access Log')}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {total} {total === 1 ? t('event') : t('events')}
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          icon="policy"
          message={t('No access events are available. This account may not hold the audit permission.')}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface">
              <caption className="sr-only">{t('Access events')}</caption>
              <thead className="bg-surface-container-high">
                <tr>
                  {['When', 'Actor', 'Action', 'Resource', 'Source'].map((heading) => (
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
                {entries.map((entry, index) => (
                  <tr key={entry.id ?? index} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-body-md text-body-md text-on-surface-variant whitespace-nowrap">
                      {formatDate(entry.created_at ?? entry.occurred_at ?? entry.timestamp, { withTime: true })}
                    </td>
                    <td className="px-4 py-3 font-body-md text-body-md text-on-surface">
                      {entry.actor ?? entry.staff_id ?? entry.user_id ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-body-md text-body-md text-on-surface">
                      {entry.action ?? entry.event ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-support-sm text-on-surface-variant">
                      {entry.resource ?? entry.resource_type ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-support-sm text-on-surface-variant">
                      {entry.ip_address ?? entry.source ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination base="/staff/audit" page={page} size={PAGE_SIZE} t={t} total={total} />
        </>
      )}
    </StaffShell>
  );
}
