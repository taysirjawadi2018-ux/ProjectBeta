import { Lockup } from './Logo.jsx';

/**
 * Shared footer for the screens that had no design of their own.
 * Port of frontend_flask/templates/partials/_footer.html.
 *
 * The national-portal footer from the redesign, reduced to the columns those
 * screens need and pointed at real routes. The ported mockups keep their own
 * footers — this does not touch them, and the root layout does not render it.
 */

const RESOURCES = [
  ['/services', 'National Services Catalog'],
  ['/track', 'Track a Request'],
  ['/help', 'Help & Support'],
];

const SOVEREIGNTY = [
  ['/legal/terms', 'Terms of Service'],
  ['/legal/privacy', 'Privacy Policy'],
  ['/accessibility', 'Accessibility Standards'],
];

const LINK = 'font-body-md text-body-md text-primary-fixed-dim hover:text-primary-fixed transition-colors focus-ring rounded';
const HEADING = 'font-label-sm text-label-sm text-tertiary-fixed-dim uppercase tracking-widest mb-md';

export default function SiteFooter({ year = new Date().getFullYear(), t = (s) => s }) {
  return (
    <footer className="bg-primary-container text-primary-fixed w-full py-lg mt-auto border-t border-tertiary-fixed/30">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg px-margin-mobile md:px-gutter max-w-container-max mx-auto">
        <div>
          <Lockup size="h-10" tone="light" extra="mb-md" />
          <p className="font-body-md text-body-md text-primary-fixed-dim">
            {t(
              'Advancing the digital sovereignty of the Tunisian Republic through secure, accessible, and high-performance infrastructure.',
            )}
          </p>
        </div>

        <div>
          <h2 className={HEADING}>{t('Resources')}</h2>
          <ul className="space-y-sm">
            {RESOURCES.map(([href, label]) => (
              <li key={href}>
                <a className={LINK} href={href}>
                  {t(label)}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className={HEADING}>{t('Sovereignty')}</h2>
          <ul className="space-y-sm">
            {SOVEREIGNTY.map(([href, label]) => (
              <li key={href}>
                <a className={LINK} href={href}>
                  {t(label)}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-md">
          <h2 className={HEADING}>{t('Connect')}</h2>
          <div className="flex gap-md">
            <a
              aria-label={t('Accessibility and language options')}
              className="material-symbols-outlined text-primary-fixed-dim hover:text-primary-fixed focus-ring rounded"
              href="/accessibility"
            >
              language
            </a>
            <a
              aria-label={t('Contact us')}
              className="material-symbols-outlined text-primary-fixed-dim hover:text-primary-fixed focus-ring rounded"
              href="/contact"
            >
              mail
            </a>
            <a
              aria-label={t('Open data')}
              className="material-symbols-outlined text-primary-fixed-dim hover:text-primary-fixed focus-ring rounded"
              href="/open-data"
            >
              public
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-container-max mx-auto px-margin-mobile md:px-gutter mt-lg pt-lg border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-md">
        <p className="font-label-sm text-label-sm text-primary-fixed-dim opacity-60">
          © {year} {t('Tunisian Republic • Digital Sovereignty Department')}
        </p>
        <a
          className="font-label-sm text-label-sm text-primary-fixed-dim hover:text-primary-fixed underline focus-ring rounded"
          href="/about"
        >
          {t('About this portal')}
        </a>
      </div>
    </footer>
  );
}
