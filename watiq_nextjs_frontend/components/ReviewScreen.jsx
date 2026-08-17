import { formatDate, formatBytes } from '@/lib/view.js';
import { STATUS_CODES } from '@/lib/workflow.js';
import StaffShell from './StaffShell.jsx';
import StatusBadge from './StatusBadge.jsx';
import EmptyState from './EmptyState.jsx';
import {
  assignRequestAction,
  setRequestStatusAction,
  verifyDocumentAction,
  downloadDocumentAction,
} from '@/lib/actions.js';

/**
 * The verification screen.
 * Port of frontend_flask/templates/verify_request.html and
 * views/staff.py:review.
 *
 * Shared by /staff/review (next in the queue) and /staff/review/[id]
 * (deep-linked), because those differ only in which request they resolve.
 *
 * The decision buttons submit STATUS CODES from lib/workflow.js, not display
 * names: PATCH /requests/{id}/status takes StatusUpdateIn{new_status_code,
 * reason} and forbids extra keys, so it wants the code from request_statuses,
 * and hardcoding workflow vocabulary in markup is how those drift apart.
 */

const DECISIONS = [
  [STATUS_CODES.approved, 'Approve', 'check_circle', 'bg-secondary-container text-on-secondary-container border-secondary'],
  [STATUS_CODES.resubmission, 'Ask for documents', 'upload_file', 'bg-tertiary-container text-on-tertiary-container border-tertiary'],
  [STATUS_CODES.rejected, 'Reject', 'cancel', 'bg-error-container text-on-error-container border-error'],
];

export default function ReviewScreen({
  request,
  history = [],
  documents = [],
  staff,
  role,
  permissions = [],
  backTo,
  t = (s) => s,
}) {
  const CARD = 'bg-surface border border-outline-variant rounded-xl p-6 shadow-sm';

  if (!request) {
    return (
      <StaffShell active="review" role={role} staff={staff} t={t}>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Review')}</h1>
        <EmptyState
          icon="task_alt"
          message={t('Nothing is waiting for review. The queue is clear.')}
          action={{ href: '/staff', label: t('Back to the workbench') }}
        />
      </StaffShell>
    );
  }

  const canReview = permissions.includes('request.review');

  return (
    <StaffShell active="review" role={role} staff={staff} t={t}>
      <nav aria-label={t('Breadcrumb')} className="font-label-sm text-label-sm text-on-surface-variant">
        <a className="hover:underline focus-ring rounded" href="/staff">{t('Workbench')}</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{request.tracking_code}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {request.service_name ?? t('Request')}
          </h1>
          <p className="font-mono text-body-md text-on-surface-variant">{request.tracking_code}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge className="text-body-md px-4 py-2" status={request.status_name} />
          {permissions.includes('request.assign') && !request.assigned_staff_id && (
            <form action={assignRequestAction}>
              <input name="request_id" type="hidden" value={request.id} />
              <button
                className="inline-flex items-center gap-2 border border-outline-variant px-5 py-2.5 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
                type="submit"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">person_add</span>
                {t('Claim')}
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className={`${CARD} xl:col-span-2 space-y-6`} aria-labelledby="submission-heading">
          <h2 className="font-headline-md text-headline-md text-on-surface" id="submission-heading">
            {t('Submission')}
          </h2>

          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              [t('Submitted'), formatDate(request.submitted_at, { withTime: true })],
              [t('Estimated ready'), formatDate(request.estimated_ready_date)],
              [t('Assigned to'), request.assigned_staff_id ? `#${request.assigned_staff_id}` : t('Unassigned')],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                  {label}
                </dt>
                <dd className="font-body-md text-body-md text-on-surface">{value}</dd>
              </div>
            ))}
          </dl>

          {request.form_data && Object.keys(request.form_data).length > 0 && (
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
                {t('What the citizen supplied')}
              </h3>
              <dl className="divide-y divide-outline-variant">
                {Object.entries(request.form_data).map(([key, value]) => (
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
          {history.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('No status changes recorded yet.')}
            </p>
          ) : (
            <ol className="space-y-4">
              {history.map((entry, index) => (
                <li key={`${entry.changed_at}-${index}`}>
                  <p className="font-body-md text-body-md text-on-surface font-bold">{entry.status_name}</p>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">
                    {formatDate(entry.changed_at, { withTime: true })}
                  </p>
                  {entry.note && (
                    <p className="font-support-sm text-support-sm text-on-surface-variant mt-1">{entry.note}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className={CARD} aria-labelledby="documents-heading">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4" id="documents-heading">
          {t('Documents')}
        </h2>

        {documents.length === 0 ? (
          <EmptyState icon="folder_off" message={t('No documents attached to this request.')} />
        ) : (
          <ul className="divide-y divide-outline-variant">
            {documents.map((document) => (
              <li key={document.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-body-md text-body-md text-on-surface font-bold">
                    {document.document_type ?? t('Document')}
                  </p>
                  <p className="font-support-sm text-support-sm text-on-surface-variant">
                    {document.mime_type} · {formatBytes(document.file_size_bytes)} ·{' '}
                    {formatDate(document.uploaded_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={document.status} />

                  <form action={downloadDocumentAction}>
                    <input name="document_id" type="hidden" value={document.id} />
                    <input name="next" type="hidden" value={backTo} />
                    <button
                      className="inline-flex items-center gap-1 border border-outline-variant px-3 py-2 rounded font-label-sm text-label-sm hover:bg-surface-container-low transition-colors focus-ring"
                      type="submit"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">download</span>
                      {t('Open')}
                    </button>
                  </form>

                  {/* VerifyIn takes status: "verified" | "rejected" and forbids
                      anything else; `decision` is mapped to one of the two in
                      the action rather than sent raw. */}
                  {permissions.includes('document.verify') && String(document.status) === 'pending' && (
                    <>
                      <form action={verifyDocumentAction}>
                        <input name="document_id" type="hidden" value={document.id} />
                        <input name="decision" type="hidden" value="accept" />
                        <input name="next" type="hidden" value={backTo} />
                        <button
                          className="inline-flex items-center gap-1 border border-secondary text-on-secondary-container bg-secondary-container px-3 py-2 rounded font-label-sm text-label-sm hover:shadow transition-all focus-ring"
                          type="submit"
                        >
                          {t('Accept')}
                        </button>
                      </form>
                      <form action={verifyDocumentAction}>
                        <input name="document_id" type="hidden" value={document.id} />
                        <input name="decision" type="hidden" value="reject" />
                        <input name="next" type="hidden" value={backTo} />
                        <button
                          className="inline-flex items-center gap-1 border border-error text-error px-3 py-2 rounded font-label-sm text-label-sm hover:bg-error-container transition-colors focus-ring"
                          type="submit"
                        >
                          {t('Reject')}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={CARD} aria-labelledby="decision-heading">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4" id="decision-heading">
          {t('Decision')}
        </h2>

        {!canReview ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('Your role does not carry the review permission. Ask an administrator if you believe it should.')}
          </p>
        ) : (
          <form action={setRequestStatusAction} className="space-y-6 max-w-2xl">
            <input name="request_id" type="hidden" value={request.id} />

            <div>
              <label
                className="block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2"
                htmlFor="reason"
              >
                {t('Reason')} <span className="normal-case">({t('shown to the citizen')})</span>
              </label>
              <textarea
                className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
                id="reason"
                maxLength={2000}
                name="reason"
                rows={4}
              />
              <p className="mt-2 font-support-sm text-support-sm text-on-surface-variant">
                {t('Required in practice for a rejection or a request for documents — it is the only explanation the citizen receives.')}
              </p>
            </div>

            {/* Three submit buttons sharing one name: the decision travels as
                the button's value, so there is no separate radio group to keep
                in step and no way to submit without choosing one. */}
            <div className="flex flex-wrap gap-3">
              {DECISIONS.map(([code, label, icon, classes]) => (
                <button
                  key={code}
                  className={`inline-flex items-center gap-2 border px-6 py-3 rounded font-label-md text-label-md hover:shadow transition-all focus-ring ${classes}`}
                  name="status_code"
                  type="submit"
                  value={code}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{icon}</span>
                  {t(label)}
                </button>
              ))}
            </div>
          </form>
        )}
      </section>
    </StaffShell>
  );
}
