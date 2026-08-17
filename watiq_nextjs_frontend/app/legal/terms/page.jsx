import { pageContext } from '@/lib/page.js';
import { pageTitle } from '@/lib/metadata.js';
import PageShell from '@/components/PageShell.jsx';
import '@/styles/pages/terms.css';

/**
 * Terms of service. The one legal slug with a design of its own.
 * Port of frontend_flask/templates/terms.html and views/public.py:terms.
 */

export const generateMetadata = pageTitle('Terms of Service');

const SECTIONS = [
  [
    'Acceptance of these terms',
    'Using the Watiq National Portal means accepting these conditions. If you do not accept them, use the counter service at any municipal office instead — every procedure available here is also available in person.',
  ],
  [
    'Your account',
    'An account is tied to one national identity card number. You are responsible for the credentials that open it, and for telling the support desk promptly if you believe someone else has used them.',
  ],
  [
    'Accuracy of what you submit',
    'Information filed through this portal carries the same weight as information filed at a counter. Submitting something you know to be false is an offence under the same provisions that apply on paper.',
  ],
  [
    'Availability',
    'The portal is operated on a best-effort basis and may be taken down for maintenance. Planned windows are published on the status page before they begin. A statutory deadline is not extended by an outage; where one is imminent, use the counter service.',
  ],
  [
    'Fees',
    'Fees shown in the service catalogue are set by the responsible authority and are payable before a request is issued. A fee already paid is not refunded because a request is later withdrawn.',
  ],
  [
    'Data protection',
    'Personal data is processed as described in the privacy policy. Requests to access, correct or erase your data are handled there rather than through this page.',
  ],
];

export default async function TermsPage() {
  const ctx = await pageContext();
  const { t } = ctx;

  return (
    <PageShell {...ctx}>
      <article className="max-w-3xl mx-auto space-y-8">
        <header className="border-b border-surface-variant pb-6">
          <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-on-surface mb-4">
            {t('Terms of Service')}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {t('The conditions that apply when you use this platform.')}
          </p>
        </header>

        <div className="bg-surface-container-low p-6 rounded-xl border border-surface-variant flex items-start gap-4">
          <span aria-hidden="true" className="material-symbols-outlined text-secondary">draw</span>
          <div>
            <h2 className="font-label-md text-label-md text-on-surface mb-2">{t('Placeholder content')}</h2>
            <p className="font-body-sm text-on-surface-variant">
              {t('This page exists so that no link in the portal is dead, and so the route, layout and navigation are in place. The wording below is a structural placeholder and has not been reviewed by a legal or content owner. Replace it before this platform serves the public.')}
            </p>
          </div>
        </div>

        <nav aria-label={t('On this page')} className="bg-surface border border-outline-variant rounded-xl p-6">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-3">
            {t('On this page')}
          </h2>
          <ol className="space-y-2 list-decimal list-inside">
            {SECTIONS.map(([heading], index) => (
              <li key={heading}>
                <a
                  className="font-body-md text-body-md text-primary hover:underline focus-ring rounded"
                  href={`#section-${index + 1}`}
                >
                  {t(heading)}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {SECTIONS.map(([heading, body], index) => (
          <section key={heading} className="space-y-3" id={`section-${index + 1}`}>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              {index + 1}. {t(heading)}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">{t(body)}</p>
          </section>
        ))}

        <footer className="border-t border-surface-variant pt-6 flex flex-wrap gap-4">
          <a className="font-body-md text-body-md text-primary hover:underline focus-ring rounded" href="/legal/privacy">
            {t('Privacy Policy')}
          </a>
          <a className="font-body-md text-body-md text-primary hover:underline focus-ring rounded" href="/accessibility">
            {t('Accessibility Statement')}
          </a>
          <a className="font-body-md text-body-md text-primary hover:underline focus-ring rounded" href="/contact">
            {t('Contact support')}
          </a>
        </footer>
      </article>
    </PageShell>
  );
}
