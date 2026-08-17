import { apiRequest } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { getTranslator } from '@/lib/i18n.js';
import MaintenanceScreen from '@/components/MaintenanceScreen.jsx';

/**
 * Platform status — the link map's `system_maintenance.html`.
 * Port of frontend_flask/views/public.py:status.
 *
 * A normal 200 page, NOT an error handler: people reach it to check whether an
 * outage is known, and a status page that answers 503 cannot be read by the
 * monitors that most want it.
 *
 * Live degradation is read from the same upstream probe /readyz uses, so the
 * banner reflects the API rather than a hand-edited constant.
 */

export const generateMetadata = pageTitle('Platform Status');

export default async function StatusPage() {
  const t = await getTranslator();

  let degraded = false;
  try {
    await apiRequest('GET', '/healthz', { auth: false, retryAuth: false });
  } catch {
    // Any failure is a degraded upstream, whether it answered badly or not at all.
    degraded = true;
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col items-center justify-between">
      <MaintenanceScreen
        title={degraded ? t('Service Degraded') : t('Scheduled Maintenance')}
        message={
          degraded
            ? t('The records service is not responding. Submissions may fail or be delayed. No action is needed on your part.')
            : t('Core services are operating normally. Planned maintenance windows are published here before they begin.')
        }
      />
    </div>
  );
}
