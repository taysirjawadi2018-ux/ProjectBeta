import { pageContext } from '@/lib/page.js';
import { pageTitle } from '@/lib/metadata.js';
import ContentPage from '@/components/ContentPage.jsx';

export const generateMetadata = pageTitle('Watiq National Portal - Privacy Policy');

export default async function Page() {
  const ctx = await pageContext();
  const { t } = ctx;

  return (
    <ContentPage slug="privacy" title="Privacy Policy" ctx={ctx}>
      <section className="space-y-4">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{t('What is in place today')}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t("Every screen is built against the Watiq design system's high-contrast requirements. A reserved overlay slot for a sign language interpreter feed is mandated across the primary citizen journeys, and all interactive controls expose visible focus indicators and accessible labels.")}
        </p>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{t('Reporting a barrier')}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('If any part of this portal prevents you from completing a procedure, tell the support desk. Reports are treated as defects, not feedback.')}
        </p>
        <a
          className="inline-flex items-center gap-2 bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md focus-ring"
          href="/contact"
        >
          <span aria-hidden="true" className="material-symbols-outlined">mail</span>
          {t('Contact support')}
        </a>
      </section>
    </ContentPage>
  );
}
