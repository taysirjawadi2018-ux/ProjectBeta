import { tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { one, query as qs, formatMoney } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import '@/styles/pages/citizen_portal.css';

/**
 * The public service catalogue. Works signed out.
 * Port of frontend_flask/templates/citizen_portal.html and
 * views/public.py:services.
 *
 * q, category and delivery narrow the list. The first two were already links in
 * the design — the landing page deep-links into a category and the header
 * carries a search box — but nothing read them, so every filter silently showed
 * everything. Filtering happens here rather than in the markup so the empty
 * state can describe what was actually asked for.
 *
 * `category` accepts either the category code or its name, because the landing
 * page links by code and the catalogue's own select does too, while
 * hand-written links in the ported mockups use readable names.
 */

export const metadata = { title: 'National Services Catalog | Watiq' };

function matches(service, { queryText, category, delivery }) {
  if (delivery === 'digital' || delivery === 'office') {
    if (Boolean(service.is_digital) !== (delivery === 'digital')) return false;
  }
  if (category) {
    const haystack = new Set([
      String(service.category_id ?? ''),
      String(service.category_code ?? '').toLowerCase(),
      String(service.category_name ?? '').toLowerCase(),
    ]);
    if (!haystack.has(category.toLowerCase())) return false;
  }
  if (queryText) {
    const text = ['name', 'description', 'code']
      .map((field) => String(service[field] ?? ''))
      .join(' ')
      .toLowerCase();
    if (!text.includes(queryText.toLowerCase())) return false;
  }
  return true;
}

export default async function ServicesPage({ searchParams }) {
  const params = await searchParams;
  const ctx = await pageContext();

  const queryText = one(params?.q).trim();
  const category = one(params?.category).trim();
  const delivery = one(params?.delivery).trim();

  const [allServices, categories, offices] = await Promise.all([
    tryGet('/api/v1/catalog/services', []),
    tryGet('/api/v1/catalog/categories', []),
    tryGet('/api/v1/catalog/offices', []),
  ]);

  const services = itemsOf(allServices).filter((s) => matches(s, { queryText, category, delivery }));
  const { t } = ctx;

  return (
    <PageShell active="services" {...ctx}>
      <header className="space-y-3">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {t('National Services Catalog')}
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
          {t('Every procedure the Republic delivers online, with the office that handles it and the fee it carries.')}
        </p>
      </header>

      {/* A GET form: the result is a bookmarkable, shareable URL, and it works
          with no scripting at all. */}
      <form action="/services" className="grid grid-cols-1 md:grid-cols-4 gap-4" method="get" role="search">
        <div className="md:col-span-2">
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2" htmlFor="q">
            {t('Search')}
          </label>
          <input
            className="w-full px-4 py-3 bg-surface border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
            defaultValue={queryText}
            id="q"
            name="q"
            placeholder={t('Birth certificate, passport, criminal record…')}
            type="search"
          />
        </div>

        <div>
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2" htmlFor="category">
            {t('Category')}
          </label>
          <select
            className="w-full px-4 py-3 bg-surface border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
            defaultValue={category}
            id="category"
            name="category"
          >
            <option value="">{t('All categories')}</option>
            {itemsOf(categories).map((c) => (
              <option key={c.id} value={c.code ?? c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-2" htmlFor="delivery">
            {t('Delivery')}
          </label>
          <select
            className="w-full px-4 py-3 bg-surface border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
            defaultValue={delivery}
            id="delivery"
            name="delivery"
          >
            <option value="">{t('Any')}</option>
            <option value="digital">{t('Online')}</option>
            <option value="office">{t('At an office')}</option>
          </select>
        </div>

        <div className="md:col-span-4 flex gap-3">
          <button
            className="bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
            type="submit"
          >
            {t('Apply filters')}
          </button>
          {(queryText || category || delivery) && (
            <a
              className="border border-outline-variant text-on-surface px-6 py-3 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
              href="/services"
            >
              {t('Clear')}
            </a>
          )}
        </div>
      </form>

      <p className="font-label-sm text-label-sm text-on-surface-variant" role="status">
        {services.length} {services.length === 1 ? t('service') : t('services')}
      </p>

      {services.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-outline-variant rounded-xl">
          <span aria-hidden="true" className="material-symbols-outlined text-[48px] text-outline">
            search_off
          </span>
          <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant">
            {/* Says what was actually asked for, rather than a bare "no results". */}
            {queryText || category || delivery
              ? t('No service matches those filters.')
              : t('The catalogue is empty right now.')}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <li
              key={service.id}
              className="bg-surface border border-outline-variant rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-headline-md text-headline-md text-on-surface">{service.name}</h2>
                <span
                  className={`shrink-0 font-label-sm text-label-sm px-2 py-1 rounded border ${
                    service.is_digital
                      ? 'bg-secondary-container text-on-secondary-container border-secondary'
                      : 'bg-surface-container-high text-on-surface-variant border-outline-variant'
                  }`}
                >
                  {service.is_digital ? t('Online') : t('At an office')}
                </span>
              </div>

              {service.description && (
                <p className="font-body-md text-body-md text-on-surface-variant">{service.description}</p>
              )}

              <dl className="grid grid-cols-2 gap-3 font-label-sm text-label-sm mt-auto">
                <div>
                  <dt className="text-on-surface-variant uppercase tracking-wide">{t('Fee')}</dt>
                  <dd className="text-on-surface font-bold">
                    {formatMoney(service.base_fee, service.currency ?? 'TND')}
                  </dd>
                </div>
                <div>
                  <dt className="text-on-surface-variant uppercase tracking-wide">{t('Processing')}</dt>
                  <dd className="text-on-surface font-bold">
                    {service.processing_time ? `${service.processing_time} ${t('days')}` : '—'}
                  </dd>
                </div>
              </dl>

              <a
                className="inline-flex items-center justify-center gap-2 bg-primary-container text-on-primary py-3 px-4 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
                href={`/requests/new${qs({ service_id: service.id })}`}
              >
                {t('Start a request')}
                <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <section className="pt-8 border-t border-outline-variant">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4">{t('Offices')}</h2>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {itemsOf(offices).map((office) => (
            <li key={office.id} className="bg-surface-container-low rounded-xl p-4 border border-outline-variant">
              <p className="font-body-md text-body-md text-on-surface font-bold">{office.name}</p>
              <p className="font-support-sm text-support-sm text-on-surface-variant">
                {[office.address, office.city, office.governorate].filter(Boolean).join(', ')}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
