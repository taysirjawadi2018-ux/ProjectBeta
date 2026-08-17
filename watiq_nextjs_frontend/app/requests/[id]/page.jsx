import { apiGet, tryGet, ApiError } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { errorViewFor } from '@/lib/errors.js';
import { failureContext } from '@/lib/failure.js';
import { formatDate, formatBytes } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import FailureScreen from '@/components/FailureScreen.jsx';
import { downloadDocumentAction, deleteDocumentAction } from '@/lib/actions.js';
import '@/styles/pages/request_detail.css';

/**
 * One request, with its history and documents.
 * Port of frontend_flask/templates/request_detail.html and
 * views/citizen.py:request_detail.
 *
 * The detail fetch is NOT a tryGet: if the request cannot be read there is no
 * page to draw. A 404 from the API here means either no such request or not
 * yours, and the two are deliberately indistinguishable (Security.md §7.3) —
 * FailureScreen renders whichever the API decided without adding a hint.
 */

export const generateMetadata = pageTitle('Request');

export default async function RequestDetailPage({ params }) {
  const { id } = await params;
  await requireLogin(`/requests/${id}`);
  const ctx = await pageContext();
  const { t } = ctx;

  let detail;
  try {
    detail = await apiGet(`/api/v1/requests/${id}`);
  } catch (err) {
    if (err?.digest) throw err;
    const view = await errorViewFor(err);
    const failure = await failureContext();
    return <FailureScreen view={view} {...failure} />;
  }

  const [history, documents] = await Promise.all([
    tryGet(`/api/v1/requests/${id}/history`, []),
    tryGet(`/api/v1/requests/${id}/documents`, []),
  ]);

  const CARD = 'bg-surface border border-outline-variant rounded-xl p-6 shadow-sm';

  return (
    <PageShell active="requests" {...ctx}>
      <nav aria-label={t('Breadcrumb')} className="font-label-sm text-label-sm text-on-surface-variant">
        <a className="hover:underline focus-ring rounded" href="/requests">{t('My Requests')}</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{detail.tracking_code}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {detail.service_name ?? t('Request')}
          </h1>
          <p className="font-mono text-body-md text-on-surface-variant">{detail.tracking_code}</p>
        </div>
        <StatusBadge className="text-body-md px-4 py-2" status={detail.status_name} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className={`${CARD} lg:col-span-2 space-y-6`} aria-labelledby="details-heading">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="details-heading">
            {t('Details')}
          </h2>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              [t('Submitted'), formatDate(detail.submitted_at, { withTime: true })],
              [t('Estimated ready'), formatDate(detail.estimated_ready_date)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                  {label}
                </dt>
                <dd className="font-body-md text-body-md text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>

          {detail.form_data && Object.keys(detail.form_data).length > 0 && (
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
                {t('Information you supplied')}
              </h3>
              <dl className="divide-y divide-outline-variant">
                {Object.entries(detail.form_data).map(([key, value]) => (
                  <div key={key} className="py-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <dt className="font-label-sm text-label-sm text-on-surface-variant">
                      {key.replace(/_/g, ' ')}
                    </dt>
                    <dd className="sm:col-span-2 font-body-md text-body-md text-on-surface break-words">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        <section className={`${CARD} space-y-4`} aria-labelledby="history-heading">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="history-heading">
            {t('History')}
          </h2>
          {itemsOf(history).length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('No status changes recorded yet.')}
            </p>
          ) : (
            <ol className="space-y-4">
              {itemsOf(history).map((entry, index) => (
                <li key={`${entry.changed_at}-${index}`} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-primary mt-1.5" />
                    {index < itemsOf(history).length - 1 && (
                      <span aria-hidden="true" className="w-px flex-1 bg-outline-variant" />
                    )}
                  </div>
                  <div className="pb-2">
                    <p className="font-body-md text-body-md text-on-surface font-bold">
                      {entry.status_name}
                    </p>
                    <p className="font-support-sm text-support-sm text-on-surface-variant">
                      {formatDate(entry.changed_at, { withTime: true })}
                    </p>
                    {entry.note && (
                      <p className="font-support-sm text-support-sm text-on-surface-variant mt-1">
                        {entry.note}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className={CARD} aria-labelledby="documents-heading">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="documents-heading">
            {t('Documents')}
          </h2>
          <a
            className="inline-flex items-center gap-2 bg-primary-container text-on-primary px-5 py-2.5 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
            href={`/requests/${id}/documents/new`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">upload_file</span>
            {t('Upload a document')}
          </a>
        </div>

        {itemsOf(documents).length === 0 ? (
          <EmptyState icon="folder_open" message={t('No documents attached to this request.')} />
        ) : (
          <ul className="divide-y divide-outline-variant">
            {itemsOf(documents).map((document) => (
              <li key={document.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <a
                    className="font-body-md text-body-md text-on-surface font-bold hover:underline focus-ring rounded"
                    href={`/requests/${id}/documents/${document.id}`}
                  >
                    {document.document_type ?? t('Document')}
                  </a>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">
                    {document.mime_type} · {formatBytes(document.file_size_bytes)} ·{' '}
                    {formatDate(document.uploaded_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={document.status} />
                  {/* Forms, not links: a download mints a presigned URL and a
                      delete is destructive — neither belongs behind a GET that
                      a prefetcher will follow. */}
                  <form action={downloadDocumentAction}>
                    <input name="document_id" type="hidden" value={document.id} />
                    <input name="next" type="hidden" value={`/requests/${id}`} />
                    <button
                      className="inline-flex items-center gap-1 border border-outline-variant px-3 py-2 rounded font-label-sm text-label-sm hover:bg-surface-container-low transition-colors focus-ring"
                      type="submit"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">download</span>
                      {t('Download')}
                    </button>
                  </form>
                  <form action={deleteDocumentAction}>
                    <input name="document_id" type="hidden" value={document.id} />
                    <input name="next" type="hidden" value={`/requests/${id}`} />
                    <button
                      className="inline-flex items-center gap-1 border border-error text-error px-3 py-2 rounded font-label-sm text-label-sm hover:bg-error-container transition-colors focus-ring"
                      type="submit"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">delete</span>
                      {t('Remove')}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
