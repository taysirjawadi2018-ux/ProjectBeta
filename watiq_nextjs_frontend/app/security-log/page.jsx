import { tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { formatDate } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import '@/styles/pages/security_log.css';

/**
 * The citizen's own access log.
 * Port of frontend_flask/templates/security_log.html and
 * views/citizen.py:security_log.
 *
 * /api/v1/audit/access-log is the only access-event feed the API exposes and it
 * is authorised server-side; whether a citizen may read their own rows is the
 * API's call, not this one's. tryGet means a 403 renders the empty state rather
 * than an error page, so the screen is honest either way — and it lights up on
 * its own the day the endpoint is scoped to self.
 */

export const metadata = { title: 'Security Log | Watiq National Portal' };

export default async function SecurityLogPage() {
  await requireLogin('/security-log');
  const ctx = await pageContext();
  const { t } = ctx;

  const data = (await tryGet('/api/v1/audit/access-log', {}, { params: { size: 50 } })) ?? {};
  const entries = itemsOf(data);
  const notifications = itemsOf(await tryGet('/api/v1/notifications', {})).slice(0, 5);

  return (
    <PageShell {...ctx}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Security Log')}</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          {t('Every access to your record that the portal has recorded. If you see something you do not recognise, tell the support desk.')}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2" aria-labelledby="log-heading">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-4" id="log-heading">
            {t('Access events')}
          </h2>

          {entries.length === 0 ? (
            <EmptyState
              icon="shield"
              message={t('No access events are available for your account right now.')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface">
                <caption className="sr-only">{t('Access events')}</caption>
                <thead className="bg-surface-container-high">
                  <tr>
                    {['When', 'Action', 'Resource', 'Source'].map((heading) => (
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
          )}
        </section>

        <section aria-labelledby="alerts-heading">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-4" id="alerts-heading">
            {t('Recent notifications')}
          </h2>
          {notifications.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">{t('Nothing new.')}</p>
          ) : (
            <ul className="space-y-3">
              {notifications.map((item) => (
                <li key={item.id} className="bg-surface border border-outline-variant rounded-xl p-4">
                  <p className="font-body-md text-body-md text-on-surface font-bold">{item.title}</p>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">
                    {formatDate(item.created_at, { withTime: true })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
