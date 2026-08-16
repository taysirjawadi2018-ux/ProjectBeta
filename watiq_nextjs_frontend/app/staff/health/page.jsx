import { apiGet, apiRequest, ApiError, tryGet } from '@/lib/api.js';
import { requireStaff } from '@/lib/guards.js';
import { getTranslator } from '@/lib/i18n.js';
import { role as sessionRole } from '@/lib/auth.js';
import StaffShell from '@/components/StaffShell.jsx';
import '@/styles/pages/staff_health.css';

/**
 * The auditor's monitoring console.
 * Port of frontend_flask/templates/staff_health.html and views/staff.py:health.
 *
 * Every tile is a probe this process can actually make, timed on the spot: the
 * BFF is up by definition (it is answering), the API is asked for its own
 * /healthz, and the four data surfaces are the endpoints the portal depends on.
 *
 * Nothing here is a stored metric — there is no metrics endpoint — so the page
 * reports reachability and latency, and SAYS SO rather than drawing a CPU gauge
 * it would have to invent.
 */

export const metadata = { title: 'System Health | Watiq Back Office' };

const CHECKS = [
  ['Upstream API', '/healthz', false],
  ['Service catalogue', '/api/v1/catalog/services', true],
  ['Office directory', '/api/v1/catalog/offices', true],
  ['Request store', '/api/v1/requests/office/queue', true],
  ['Access log', '/api/v1/audit/access-log', true],
];

const TONES = {
  ok: ['bg-secondary-container text-on-secondary-container border-secondary', 'check_circle', 'Reachable'],
  // An ApiError means the service answered — it simply refused. That is a
  // different fault from silence, and collapsing the two sends an auditor
  // chasing a network problem that is really a permission.
  degraded: ['bg-tertiary-container text-on-tertiary-container border-tertiary', 'error', 'Answering with an error'],
  down: ['bg-error-container text-on-error-container border-error', 'cancel', 'Not responding'],
};

async function probe(label, path, authRequired) {
  const started = performance.now();
  let status = 'ok';
  try {
    if (authRequired) await apiGet(path);
    else await apiRequest('GET', path, { auth: false, retryAuth: false });
  } catch (err) {
    status = err instanceof ApiError ? 'degraded' : 'down';
  }
  return { label, path, status, ms: Math.round(performance.now() - started) };
}

export default async function HealthPage() {
  await requireStaff('/staff/health');
  const t = await getTranslator();
  const role = await sessionRole();

  const [checks, staff] = await Promise.all([
    Promise.all(CHECKS.map(([label, path, auth]) => probe(label, path, auth))),
    tryGet('/api/v1/staff/me', null),
  ]);

  const healthy = checks.filter((c) => c.status === 'ok').length;

  return (
    <StaffShell active="health" role={role} staff={staff} t={t}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('System Health')}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {healthy} {t('of')} {checks.length} {t('surfaces reachable')} ·{' '}
          {t('probed when this page was requested')}
        </p>
      </header>

      <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <li className="bg-surface border border-outline-variant rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-on-secondary-container">
              check_circle
            </span>
            <h2 className="font-headline-md text-headline-md text-on-surface">{t('This portal')}</h2>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {/* Up by definition: it rendered this page. */}
            {t('Serving requests.')}
          </p>
        </li>

        {checks.map((check) => {
          const [classes, icon, label] = TONES[check.status];
          return (
            <li key={check.path} className={`rounded-xl p-6 border space-y-2 ${classes}`}>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined">{icon}</span>
                <h2 className="font-headline-md text-headline-md">{t(check.label)}</h2>
              </div>
              <p className="font-body-md text-body-md">{t(label)}</p>
              <p className="font-mono text-support-sm opacity-80">{check.path}</p>
              <p className="font-label-sm text-label-sm">
                {check.ms} {t('ms')}
              </p>
            </li>
          );
        })}
      </ul>

      <section className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-2">
          {t('What this page is not')}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('These are live reachability and latency probes made when the page was requested, not stored metrics. There is no metrics endpoint behind this portal, so no CPU, memory or throughput figure shown here would be real. For historical data, use the platform monitoring stack.')}
        </p>
      </section>
    </StaffShell>
  );
}
