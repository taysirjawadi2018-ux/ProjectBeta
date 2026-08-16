import { redirect } from 'next/navigation';
import { apiGet, tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { errorViewFor } from '@/lib/errors.js';
import { failureContext } from '@/lib/failure.js';
import { formatDate, formatBytes } from '@/lib/view.js';
import { flash } from '@/lib/flash.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import FailureScreen from '@/components/FailureScreen.jsx';
import { downloadDocumentAction, deleteDocumentAction } from '@/lib/actions.js';
import '@/styles/pages/document_detail.css';

/**
 * One document, with the seal and audit trail its mockup draws.
 * Port of frontend_flask/templates/document_detail.html and
 * views/citizen.py:document_detail.
 *
 * Addressed through its request because the API publishes no
 * GET /documents/{id} — only the per-request listing — so the document is
 * picked out of that list rather than fetched directly. That also keeps the
 * authorisation where it was: if it is not in the request's list, it is not
 * yours to read.
 */

export const metadata = { title: 'Document | Watiq National Portal' };

export default async function DocumentDetailPage({ params }) {
  const { id, documentId } = await params;
  await requireLogin(`/requests/${id}/documents/${documentId}`);
  const ctx = await pageContext();
  const { t } = ctx;

  const documents = itemsOf(await tryGet(`/api/v1/requests/${id}/documents`, []));
  const document = documents.find((d) => String(d.id) === String(documentId));

  if (!document) {
    await flash(t('That document is not on this request.'), 'error');
    redirect('/documents');
  }

  let request;
  try {
    request = await apiGet(`/api/v1/requests/${id}`);
  } catch (err) {
    if (err?.digest) throw err;
    return <FailureScreen view={await errorViewFor(err)} {...(await failureContext())} />;
  }

  const history = itemsOf(await tryGet(`/api/v1/requests/${id}/history`, []));
  const CARD = 'bg-surface border border-outline-variant rounded-xl p-6 shadow-sm';

  return (
    <PageShell active="requests" {...ctx}>
      <nav aria-label={t('Breadcrumb')} className="font-label-sm text-label-sm text-on-surface-variant">
        <a className="hover:underline focus-ring rounded" href="/documents">{t('My Documents')}</a>
        <span aria-hidden="true"> / </span>
        <a className="hover:underline focus-ring rounded" href={`/requests/${id}`}>{request.tracking_code}</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{document.document_type ?? t('Document')}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {document.document_type ?? t('Document')}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {request.service_name} · <span className="font-mono">{request.tracking_code}</span>
          </p>
        </div>
        <StatusBadge className="text-body-md px-4 py-2" status={document.status} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className={`${CARD} lg:col-span-2 space-y-6`} aria-labelledby="file-heading">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="file-heading">
            {t('File')}
          </h2>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              [t('Type'), document.mime_type],
              [t('Size'), formatBytes(document.file_size_bytes)],
              [t('Uploaded'), formatDate(document.uploaded_at, { withTime: true })],
              [t('Verified'), formatDate(document.verified_at, { withTime: true })],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                  {label}
                </dt>
                <dd className="font-body-md text-body-md text-on-surface">{value || '—'}</dd>
              </div>
            ))}
          </dl>

          {/* No preview and no thumbnail: the object-storage URL is
              cross-origin and `default-src 'none'` refuses it as a subresource.
              A download is a top-level navigation, which is unaffected. */}
          <div className="flex flex-wrap gap-3 pt-2 border-t border-outline-variant">
            <form action={downloadDocumentAction}>
              <input name="document_id" type="hidden" value={document.id} />
              <input name="next" type="hidden" value={`/requests/${id}/documents/${documentId}`} />
              <button
                className="inline-flex items-center gap-2 bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
                type="submit"
              >
                <span aria-hidden="true" className="material-symbols-outlined">download</span>
                {t('Download')}
              </button>
            </form>
            <form action={deleteDocumentAction}>
              <input name="document_id" type="hidden" value={document.id} />
              <input name="next" type="hidden" value="/documents" />
              <button
                className="inline-flex items-center gap-2 border border-error text-error px-6 py-3 rounded font-label-md text-label-md hover:bg-error-container transition-colors focus-ring"
                type="submit"
              >
                <span aria-hidden="true" className="material-symbols-outlined">delete</span>
                {t('Remove')}
              </button>
            </form>
          </div>
        </section>

        <section className={`${CARD} space-y-4`} aria-labelledby="trail-heading">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="trail-heading">
            {t('Request history')}
          </h2>
          {history.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('No status changes recorded yet.')}
            </p>
          ) : (
            <ol className="space-y-4">
              {history.map((entry, index) => (
                <li key={`${entry.changed_at}-${index}`}>
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
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </PageShell>
  );
}
