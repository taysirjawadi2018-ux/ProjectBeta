import { tryGet } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { intOr, formatMoney } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import SubmitRequestForm from './SubmitRequestForm.jsx';
import '@/styles/pages/submit_request.css';

/**
 * File a new request.
 * Port of frontend_flask/templates/submit_request.html and
 * views/citizen.py:submit_request.
 *
 * A request is filed against an office_service_id — the row that ties ONE
 * service to ONE office — and that is only listable per office, so the office
 * is chosen first and its services are fetched for it. Previously no template
 * rendered this field at all, so every POST failed the office_service_id check
 * and bounced straight back to the form.
 *
 * The office choice is a GET round-trip rather than a scripted fetch: the
 * result is a bookmarkable URL, the back button works, and the second step
 * exists at all without JavaScript.
 */

export const generateMetadata = pageTitle('File a Request');

export default async function SubmitRequestPage({ searchParams }) {
  await requireLogin('/requests/new');
  const params = await searchParams;
  const ctx = await pageContext();
  const { t } = ctx;

  const officeId = intOr(params?.office_id, null);
  const serviceId = intOr(params?.service_id, null);

  const [services, offices, officeServicesRaw] = await Promise.all([
    tryGet('/api/v1/catalog/services', []),
    tryGet('/api/v1/catalog/offices', []),
    officeId ? tryGet(`/api/v1/catalog/offices/${officeId}/services`, []) : Promise.resolve([]),
  ]);

  const officeServices = itemsOf(officeServicesRaw).filter((s) => s.is_available !== false);
  const office = itemsOf(offices).find((o) => o.id === officeId) ?? null;

  return (
    <PageShell active="requests" {...ctx}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('File a Request')}</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          {t('Choose the office that will handle your request, then the service you need from it.')}
        </p>
      </header>

      {/* Step 1. A GET form, so the chosen office lands in the URL. */}
      <section className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4">
          <span className="text-primary">1.</span> {t('Choose an office')}
        </h2>
        <form action="/requests/new" className="flex flex-wrap items-end gap-3" method="get">
          {serviceId ? <input name="service_id" type="hidden" value={serviceId} /> : null}
          <div className="flex-1 min-w-[16rem]">
            <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2" htmlFor="office_id">
              {t('Office')}
            </label>
            <select
              className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
              defaultValue={officeId ?? ''}
              id="office_id"
              name="office_id"
              required
            >
              <option value="">{t('Select an office…')}</option>
              {itemsOf(offices).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.governorate ? ` — ${o.governorate}` : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            className="bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
            type="submit"
          >
            {t('Show services')}
          </button>
        </form>

        {office && (
          <p className="mt-4 font-support-sm text-support-sm text-on-surface-variant">
            {[office.address, office.city, office.governorate].filter(Boolean).join(', ')}
          </p>
        )}
      </section>

      {/* Step 2. Only reachable once an office is chosen, because
          office_service_id does not exist before then. */}
      <section className="bg-surface border border-outline-variant rounded-xl p-6 shadow-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4">
          <span className="text-primary">2.</span> {t('Describe what you need')}
        </h2>

        {!officeId ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('Choose an office above to see the services it offers.')}
          </p>
        ) : officeServices.length === 0 ? (
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('That office is not offering any service online right now. Try another office, or visit it in person.')}
          </p>
        ) : (
          <SubmitRequestForm
            officeId={officeId}
            officeServices={officeServices.map((s) => ({
              id: s.id,
              name: s.name,
              fee: formatMoney(s.fee_override ?? s.base_fee, s.currency ?? 'TND'),
              processing: s.processing_time_override ?? s.processing_time,
              catalogId: s.catalog_id,
            }))}
            preselectCatalogId={serviceId}
          />
        )}
      </section>

      <p className="font-support-sm text-support-sm text-on-surface-variant">
        {t('Not sure which service you need?')}{' '}
        <a className="underline hover:text-primary focus-ring rounded" href="/services">
          {t('Browse the catalogue')}
        </a>
        {' · '}
        <a className="underline hover:text-primary focus-ring rounded" href="/help">
          {t('Read the guidance')}
        </a>
      </p>
    </PageShell>
  );
}
