import { tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { one, formatDate, formatBytes, query as qs } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import { downloadDocumentAction } from '@/lib/actions.js';
import '@/styles/pages/my_documents.css';

/**
 * Every document the citizen holds, assembled request by request.
 * Port of frontend_flask/templates/my_documents.html and
 * views/citizen.py:documents.
 *
 * There is no "all my documents" endpoint — documents are listed per request —
 * so this walks the request list and collects them. That is the whole reason
 * the design's "My Documents" links used to point at /requests: the screen
 * could not be built. It is bounded by the request page size rather than
 * unbounded, and each document keeps a back-reference to its request so the
 * detail route can address it without a second lookup.
 */

export const metadata = { title: 'My Documents | Watiq National Portal' };

const KINDS = ['verified', 'pending', 'rejected'];

export default async function DocumentsPage({ searchParams }) {
  await requireLogin('/documents');
  const params = await searchParams;
  const ctx = await pageContext();
  const { t } = ctx;

  const requests = itemsOf(await tryGet('/api/v1/requests', {}, { params: { size: 50 } }));

  const collected = (
    await Promise.all(
      requests.map(async (item) => {
        const docs = itemsOf(await tryGet(`/api/v1/requests/${item.id}/documents`, []));
        return docs.map((document) => ({ ...document, request: item }));
      }),
    )
  ).flat();

  const kind = one(params?.status).trim().toLowerCase();
  const filtered = KINDS.includes(kind)
    ? collected.filter((d) => String(d.status) === kind)
    : collected;

  const counts = Object.fromEntries(
    KINDS.map((key) => [key, collected.filter((d) => String(d.status) === key).length]),
  );

  return (
    <PageShell active="requests" {...ctx}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('My Documents')}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('Every document attached to one of your requests.')}
        </p>
      </header>

      <nav aria-label={t('Filter by status')} className="flex flex-wrap gap-2">
        <a
          aria-current={KINDS.includes(kind) ? undefined : 'page'}
          className={`font-label-sm text-label-sm px-4 py-2 rounded-full border transition-colors focus-ring ${
            KINDS.includes(kind)
              ? 'border-outline-variant text-on-surface hover:bg-surface-container-low'
              : 'bg-primary-container text-on-primary border-primary-container'
          }`}
          href="/documents"
        >
          {t('All')} ({collected.length})
        </a>
        {KINDS.map((key) => (
          <a
            key={key}
            aria-current={kind === key ? 'page' : undefined}
            className={`font-label-sm text-label-sm px-4 py-2 rounded-full border transition-colors focus-ring ${
              kind === key
                ? 'bg-primary-container text-on-primary border-primary-container'
                : 'border-outline-variant text-on-surface hover:bg-surface-container-low'
            }`}
            href={`/documents${qs({ status: key })}`}
          >
            {t(key.charAt(0).toUpperCase() + key.slice(1))} ({counts[key]})
          </a>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <EmptyState
          icon="folder_open"
          message={
            KINDS.includes(kind)
              ? t('No document has that status.')
              : t('You have not uploaded a document yet.')
          }
          action={
            KINDS.includes(kind)
              ? { href: '/documents', label: t('Show all documents') }
              : { href: '/requests', label: t('Go to your requests') }
          }
        />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((document) => (
            <li
              key={`${document.request.id}-${document.id}`}
              className="bg-surface border border-outline-variant rounded-xl p-5 flex flex-col gap-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <a
                  className="font-body-lg text-body-lg text-on-surface font-bold hover:underline focus-ring rounded"
                  href={`/requests/${document.request.id}/documents/${document.id}`}
                >
                  {document.document_type ?? t('Document')}
                </a>
                <StatusBadge status={document.status} />
              </div>

              <p className="font-support-sm text-support-sm text-on-surface-variant">
                {document.mime_type} · {formatBytes(document.file_size_bytes)}
              </p>
              <p className="font-support-sm text-support-sm text-on-surface-variant">
                {t('Uploaded')} {formatDate(document.uploaded_at)}
              </p>

              <a
                className="font-support-sm text-support-sm text-primary hover:underline focus-ring rounded"
                href={`/requests/${document.request.id}`}
              >
                {document.request.service_name ?? t('Request')} ·{' '}
                <span className="font-mono">{document.request.tracking_code}</span>
              </a>

              <form action={downloadDocumentAction} className="mt-auto pt-2">
                <input name="document_id" type="hidden" value={document.id} />
                <input name="next" type="hidden" value="/documents" />
                <button
                  className="w-full inline-flex items-center justify-center gap-2 border border-outline-variant px-4 py-2.5 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
                  type="submit"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[18px]">download</span>
                  {t('Download')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
