import { apiGet, ApiError } from '@/lib/api.js';
import { pageContext } from '@/lib/page.js';
import { one, formatDate, statusTone, statusLabel } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';

/**
 * Public tracking-code lookup — the one read that needs no session.
 * Port of frontend_flask/templates/track.html and views/public.py:track.
 */

export const metadata = { title: 'Track a Request | Watiq National Portal' };

export default async function TrackPage({ searchParams }) {
  const params = await searchParams;
  const ctx = await pageContext();
  const { t } = ctx;

  const code = one(params?.code).trim();
  let result = null;
  let notFound = false;

  if (code) {
    try {
      result = await apiGet(`/api/v1/requests/track/${encodeURIComponent(code)}`, { auth: false });
    } catch (err) {
      // The same response whether the code is malformed or simply not yours: a
      // distinguishable answer makes this a tracking-code oracle, which is the
      // enumeration the CrowdSec watiq/tracking-enum scenario watches for.
      if (!(err instanceof ApiError)) throw err;
      notFound = true;
    }
  }

  return (
    <PageShell {...ctx}>
      <header className="space-y-3">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Track a Request')}</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          {t('Enter the tracking code printed on your receipt to see where a request has got to. No sign-in needed.')}
        </p>
      </header>

      <form action="/track" className="flex flex-col sm:flex-row gap-3 max-w-2xl" method="get" role="search">
        <label className="sr-only" htmlFor="code">{t('Tracking code')}</label>
        <input
          className="flex-1 px-4 py-3 bg-surface border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-mono"
          defaultValue={code}
          id="code"
          name="code"
          placeholder="WTQ-2026-000011"
          required
          type="text"
        />
        <button
          className="bg-primary-container text-on-primary px-8 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
          type="submit"
        >
          {t('Track')}
        </button>
      </form>

      {notFound && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border bg-error-container border-error text-on-error-container max-w-2xl"
          role="alert"
        >
          <span aria-hidden="true" className="material-symbols-outlined">warning</span>
          <p className="font-body-md text-body-md">{t('No request matches that tracking code.')}</p>
        </div>
      )}

      {result && (
        <section className="bg-surface border border-outline-variant rounded-xl p-8 max-w-2xl shadow-sm space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                {t('Tracking code')}
              </p>
              <p className="font-mono text-headline-md text-on-surface">{result.tracking_code}</p>
            </div>
            <span
              className={`shrink-0 font-label-sm text-label-sm px-3 py-1.5 rounded border ${statusTone(result.status_name)}`}
            >
              {statusLabel(result.status_name)}
            </span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-body-md text-body-md">
            {[
              [t('Service'), result.service_name],
              [t('Office'), result.office_name],
              [t('Submitted'), formatDate(result.submitted_at)],
              [t('Estimated ready'), formatDate(result.estimated_ready_date)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                  {label}
                </dt>
                <dd className="text-on-surface">{value || '—'}</dd>
              </div>
            ))}
          </dl>

          {/* Deliberately no citizen name, national ID or document list: this
              page is reachable by anyone holding the code. */}
          <p className="font-support-sm text-support-sm text-on-surface-variant border-t border-outline-variant pt-4">
            {t('Sign in to see the documents and full history for this request.')}
          </p>
        </section>
      )}
    </PageShell>
  );
}
