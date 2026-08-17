import { tryGet } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf, totalOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { one, intOr, formatDate } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import Pagination from '@/components/Pagination.jsx';
import '@/styles/pages/my_requests.css';

/**
 * The citizen's request list.
 * Port of frontend_flask/templates/my_requests.html and
 * views/citizen.py:requests_list.
 */

export const generateMetadata = pageTitle('My Requests');

const PAGE_SIZE = 20;

export default async function RequestsPage({ searchParams }) {
  await requireLogin('/requests');
  const params = await searchParams;
  const ctx = await pageContext();
  const { t } = ctx;

  const page = Math.max(1, intOr(params?.page, 1));
  const status = one(params?.status).trim();

  const data =
    (await tryGet('/api/v1/requests', {}, {
      params: { page, size: PAGE_SIZE, ...(status ? { status } : {}) },
    })) ?? {};

  const requests = itemsOf(data);
  const total = totalOf(data);

  return (
    <PageShell active="requests" {...ctx}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('My Requests')}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {total} {total === 1 ? t('request') : t('requests')}
          </p>
        </div>
        <a
          className="inline-flex items-center gap-2 bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
          href="/requests/new"
        >
          <span aria-hidden="true" className="material-symbols-outlined">note_add</span>
          {t('File a request')}
        </a>
      </header>

      {/* A GET form, so a filtered list is a URL that can be bookmarked and
          shared, and works with no scripting. */}
      <form action="/requests" className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2" htmlFor="status">
            {t('Status')}
          </label>
          <input
            className="px-4 py-3 bg-surface border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
            defaultValue={status}
            id="status"
            name="status"
            placeholder={t('Any status')}
            type="text"
          />
        </div>
        <button
          className="bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
          type="submit"
        >
          {t('Filter')}
        </button>
        {status && (
          <a
            className="border border-outline-variant text-on-surface px-6 py-3 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
            href="/requests"
          >
            {t('Clear')}
          </a>
        )}
      </form>

      {requests.length === 0 ? (
        <EmptyState
          icon="description"
          message={
            status
              ? t('No request matches that status.')
              : t('You have not filed a request yet.')
          }
          action={status ? { href: '/requests', label: t('Clear the filter') } : { href: '/services', label: t('Browse services') }}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface">
            <caption className="sr-only">{t('Your requests')}</caption>
            <thead className="bg-surface-container-high">
              <tr>
                {['Service', 'Tracking code', 'Status', 'Submitted', 'Ready by'].map((heading) => (
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
              {requests.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-4">
                    <a
                      className="font-body-md text-body-md text-on-surface font-bold hover:underline focus-ring rounded"
                      href={`/requests/${item.id}`}
                    >
                      {item.service_name ?? t('Request')}
                    </a>
                  </td>
                  <td className="px-4 py-4 font-mono text-support-sm text-on-surface-variant">
                    {item.tracking_code}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={item.status_name} />
                  </td>
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                    {formatDate(item.submitted_at)}
                  </td>
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                    {formatDate(item.estimated_ready_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        base="/requests"
        page={page}
        params={{ status }}
        size={PAGE_SIZE}
        t={t}
        total={total}
      />
    </PageShell>
  );
}
