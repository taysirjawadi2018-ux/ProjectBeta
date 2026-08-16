import { apiGet, tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { errorViewFor } from '@/lib/errors.js';
import { failureContext } from '@/lib/failure.js';
import { formatDate, formatBytes } from '@/lib/view.js';
import { MAX_CONTENT_LENGTH } from '@/lib/config.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import FailureScreen from '@/components/FailureScreen.jsx';
import UploadForm from './UploadForm.jsx';
import '@/styles/pages/document_upload.css';

/**
 * The upload screen.
 * Port of frontend_flask/templates/document_upload.html and
 * views/citizen.py:upload_page.
 *
 * The file goes browser → object storage and never passes through this
 * process. The server only asks the API for a presigned PUT and confirms
 * afterwards, which is why this is the one screen in the port that genuinely
 * needs JavaScript: a plain form post cannot PUT to a second origin.
 */

export const metadata = { title: 'Upload a Document | Watiq National Portal' };

export default async function UploadPage({ params }) {
  const { id } = await params;
  await requireLogin(`/requests/${id}/documents/new`);
  const ctx = await pageContext();
  const { t } = ctx;

  let request;
  try {
    request = await apiGet(`/api/v1/requests/${id}`);
  } catch (err) {
    if (err?.digest) throw err;
    return <FailureScreen view={await errorViewFor(err)} {...(await failureContext())} />;
  }

  const documents = itemsOf(await tryGet(`/api/v1/requests/${id}/documents`, []));

  return (
    <PageShell active="requests" {...ctx}>
      <nav aria-label={t('Breadcrumb')} className="font-label-sm text-label-sm text-on-surface-variant">
        <a className="hover:underline focus-ring rounded" href="/requests">{t('My Requests')}</a>
        <span aria-hidden="true"> / </span>
        <a className="hover:underline focus-ring rounded" href={`/requests/${id}`}>{request.tracking_code}</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{t('Upload')}</span>
      </nav>

      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Upload a Document')}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {request.service_name} · <span className="font-mono">{request.tracking_code}</span>
        </p>
      </header>

      <section className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm max-w-2xl">
        <UploadForm maxBytes={MAX_CONTENT_LENGTH} requestId={id} />
      </section>

      {documents.length > 0 && (
        <section className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-4">
            {t('Already attached')}
          </h2>
          <ul className="divide-y divide-outline-variant">
            {documents.map((document) => (
              <li key={document.id} className="py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-body-md text-body-md text-on-surface font-bold">
                    {document.document_type ?? t('Document')}
                  </p>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">
                    {document.mime_type} · {formatBytes(document.file_size_bytes)} ·{' '}
                    {formatDate(document.uploaded_at)}
                  </p>
                </div>
                <StatusBadge status={document.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
