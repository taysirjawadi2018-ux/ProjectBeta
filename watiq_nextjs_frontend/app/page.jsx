import { Mark } from '@/components/Logo.jsx';
import { pageContext } from '@/lib/page.js';
import { pageTitle } from '@/lib/metadata.js';
import '@/styles/pages/index.css';

/**
 * The national portal landing page.
 * Port of frontend_flask/templates/index.html.
 *
 * Carries its own header and footer — this is one of the four chrome
 * archetypes, and it is why the root layout renders neither.
 */

export const generateMetadata = pageTitle('Watiq National Portal | Republic of Tunisia', { suffix: null });

// The four categories are the mockup's own copy, not catalogue rows: each card
// deep-links into the catalogue filtered to that category.
const CATEGORIES = [
  ['civil', 'diversity_3', 'Civil Status', 'Birth, marriage, death certificates and certified family documents.'],
  ['identity', 'badge', 'Identity', 'CIN renewal, passport applications, and secure residency certificates.'],
  ['justice', 'gavel', 'Justice', 'Criminal record certificates and legal case tracking.'],
  ['admin', 'business_center', 'Admin', 'Tax declarations, administrative permits, and centralized licensing.'],
];

const SPECS = [
  ['security', 'Zero Trust Architecture', 'Every request is authenticated, authorized, and continuously inspected.'],
  ['api', 'X-Road Standard', 'Secure interoperability layer ensuring the integrity of data exchanges.'],
  ['lan', 'Multi-Hosting', 'Geographical redundancy across three isolated national data centers.'],
];

const FOOTER_LINKS = [
  ['/legal/privacy', 'Privacy Policy'],
  ['/legal/terms', 'Terms of Service'],
  ['/legal/terms', 'Security Protocols'],
  ['/contact', 'Contact Support'],
  ['/status', 'System Status'],
];

export default async function PortalIndex() {
  const { t, isAuthenticated } = await pageContext({ withUnread: false, withProfile: false });
  const year = new Date().getFullYear();

  return (
    <div className="bg-background text-on-surface font-body-md selection:bg-secondary-fixed selection:text-on-secondary-fixed overflow-x-hidden">
      <img
        alt={t('Tunisian National Emblem Watermark')}
        className="watermark-emblem"
        src="/img/img-a5f82587302e.jpg"
      />

      <header className="fixed top-0 w-full h-20 bg-surface dark:bg-inverse-surface border-b border-outline-variant dark:border-outline shadow-sm z-50 flex items-center">
        <div className="flex justify-between items-center w-full px-margin-desktop max-w-container-max mx-auto">
          <div className="flex items-center gap-4">
            <a className="flex items-center gap-3 focus-ring rounded" href="/">
              <Mark size="h-9" />
              <span className="font-headline-md text-headline-md text-primary dark:text-inverse-primary uppercase tracking-wider">
                {t('Republic of Tunisia')}
              </span>
            </a>
          </div>
          <nav className="hidden md:flex items-center gap-8" aria-label={t('Service categories')}>
            {CATEGORIES.map(([code, , title], index) => (
              <a
                key={code}
                className={
                  index === 0
                    ? 'text-primary dark:text-inverse-primary border-b-2 border-primary dark:border-inverse-primary pb-1 font-bold font-label-md text-label-md transition-all active:scale-95 duration-150'
                    : 'text-secondary dark:text-secondary-fixed-dim hover:text-primary transition-colors font-label-md text-label-md transition-all active:scale-95 duration-150'
                }
                href={`/services?category=${code}`}
              >
                {t(title)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <a
                aria-label={t('About the national institutions')}
                className="material-symbols-outlined text-primary hover:bg-surface-container-high p-2 rounded-full transition-all focus-ring"
                href="/about"
              >
                account_balance
              </a>
              <a
                aria-label={t('Notifications')}
                className="material-symbols-outlined text-primary hover:bg-surface-container-high p-2 rounded-full transition-all focus-ring"
                href="/notifications"
              >
                notifications
              </a>
              <a
                aria-label={isAuthenticated ? t('Your profile') : t('Sign in')}
                className="material-symbols-outlined text-primary hover:bg-surface-container-high p-2 rounded-full transition-all focus-ring"
                href={isAuthenticated ? '/profile' : '/login'}
              >
                account_circle
              </a>
              {!isAuthenticated && (
                <a
                  className="font-label-md text-label-md text-on-primary bg-primary-container px-4 py-2 rounded-sm hover:shadow-lg transition-all focus-ring"
                  href="/register"
                >
                  {t('Register')}
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="pt-20" id="main">
        <section className="relative min-h-[85vh] flex items-center overflow-hidden" id="hero">
          <div className="relative z-10 w-full max-w-container-max mx-auto px-margin-desktop grid grid-cols-12 gap-gutter">
            <div className="col-span-12 lg:col-span-7 flex flex-col justify-center gap-8">
              <div className="inline-flex items-center gap-2 bg-secondary-fixed px-3 py-1 rounded-sm w-fit">
                <span aria-hidden="true" className="material-symbols-outlined icon-filled text-[16px]">
                  verified_user
                </span>
                <span className="font-label-caps text-label-caps text-on-secondary-fixed uppercase">
                  {t('Sovereign Gateway Verified')}
                </span>
              </div>

              <h1 className="font-headline-lg text-headline-lg text-on-surface">
                {t('Secure Access to')} <br />
                <span className="text-primary-container">{t('National Services')}</span>
              </h1>

              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
                {t('Welcome to Watiq, the unified portal of the Republic of Tunisia. A trusted infrastructure for your administrative, legal, and civil status procedures.')}
              </p>

              <div className="flex flex-wrap gap-4 pt-4">
                <a
                  className="bg-primary-container text-on-primary px-8 py-4 rounded-sm font-headline-md text-body-md hover:shadow-xl active:scale-95 transition-all flex items-center gap-3 focus-ring"
                  href={isAuthenticated ? '/dashboard' : '/login'}
                >
                  {t('Access Portal')}
                  <span aria-hidden="true" className="material-symbols-outlined">login</span>
                </a>
                <a
                  className="border border-primary-container text-primary-container px-8 py-4 rounded-sm font-headline-md text-body-md hover:bg-surface-container-low transition-all focus-ring"
                  href="/help"
                >
                  {t('View Documentation')}
                </a>
                <a
                  className="border border-primary-container text-primary-container px-8 py-4 rounded-sm font-headline-md text-body-md hover:bg-surface-container-low transition-all focus-ring flex items-center gap-3"
                  href="/appointments/book"
                >
                  {t('Book Appointment')}
                  <span aria-hidden="true" className="material-symbols-outlined">event_available</span>
                </a>
              </div>

              <div className="mt-12 flex gap-8 items-center border-t border-outline-variant pt-8">
                <div className="flex flex-col">
                  <span className="font-label-caps text-label-caps text-outline uppercase">{t('Uptime')}</span>
                  <span className="font-headline-md text-headline-md">99.99%</span>
                </div>
                <div className="h-10 w-px bg-outline-variant" />
                <div className="flex flex-col">
                  <span className="font-label-caps text-label-caps text-outline uppercase">{t('Encryption')}</span>
                  <span className="font-headline-md text-headline-md">{t('AES-256-GCM')}</span>
                </div>
                <div className="h-10 w-px bg-outline-variant" />
                <div className="flex flex-col">
                  <span className="font-label-caps text-label-caps text-outline uppercase">{t('Status')}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-headline-md text-headline-md">{t('Operational')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex col-span-5 items-center justify-center">
              <div className="relative w-full aspect-[4/5] rounded-xl overflow-hidden shadow-2xl glass-panel p-1">
                <div className="h-full w-full rounded-lg sovereign-gradient relative overflow-hidden flex flex-col p-10 text-surface">
                  <div className="absolute top-0 end-0 p-8">
                    <span aria-hidden="true" className="material-symbols-outlined text-6xl opacity-20">shield</span>
                  </div>
                  <span className="font-label-caps text-label-caps text-secondary-fixed mb-4">
                    {t('SYSTEM ARCHITECTURE')}
                  </span>
                  <h2 className="font-headline-md text-headline-md mb-6">{t('Watiq Sovereign Cloud')}</h2>
                  <div className="space-y-6">
                    {[
                      ['cloud_done', 'Infrastructure hosted exclusively on national territory.'],
                      ['fingerprint', 'Biometric identification and certified electronic signature.'],
                      ['database', 'Real-time interoperability with civil status registries.'],
                    ].map(([icon, copy]) => (
                      <div key={icon} className="flex gap-4">
                        <span aria-hidden="true" className="material-symbols-outlined text-secondary-fixed">
                          {icon}
                        </span>
                        <p className="font-support-sm text-support-sm opacity-80">{t(copy)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-auto border-t border-white/10 pt-6">
                    <p className="font-label-caps text-[10px] opacity-50 mb-2">{t('AUTH_TOKEN_ACTIVE')}</p>
                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full w-2/3 bg-secondary-fixed" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-surface-container-low relative" id="services">
          <div className="max-w-container-max mx-auto px-margin-desktop">
            <div className="flex flex-col mb-16 text-center items-center">
              <span className="font-label-caps text-label-caps text-secondary uppercase mb-4">
                {t('Service Categories')}
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface max-w-2xl">
                {t('Universal access to digital administration')}
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {CATEGORIES.map(([code, icon, title, blurb]) => (
                <a
                  key={code}
                  className="group bg-surface hover:bg-primary-container hover:text-on-primary transition-all duration-500 p-8 rounded-xl border border-outline-variant flex flex-col gap-6 cursor-pointer shadow-sm hover:shadow-2xl focus-ring"
                  href={`/services?category=${code}`}
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-4xl text-primary-container group-hover:text-secondary-fixed transition-colors"
                  >
                    {icon}
                  </span>
                  <div>
                    <h3 className="font-headline-md text-headline-md mb-2">{t(title)}</h3>
                    <p className="font-body-md text-on-surface-variant group-hover:text-surface-variant">
                      {t(blurb)}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-2 font-label-caps text-label-caps opacity-0 group-hover:opacity-100 transition-opacity">
                    {t('Open Service')}{' '}
                    <span aria-hidden="true" className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="py-24 bg-white overflow-hidden relative" id="technical">
          <div className="max-w-container-max mx-auto px-margin-desktop grid grid-cols-12 gap-gutter items-center">
            <div className="col-span-12 md:col-span-6 order-2 md:order-1">
              <div className="p-8 border border-outline-variant rounded-sm bg-surface-container-lowest relative overflow-hidden">
                <div className="absolute -end-10 -top-10">
                  <span aria-hidden="true" className="material-symbols-outlined text-[180px] text-surface-container">
                    memory
                  </span>
                </div>
                <div className="relative z-10">
                  <h2 className="font-headline-md text-headline-md text-on-surface mb-8">
                    {t('Technical Specifications')}
                  </h2>
                  <div className="grid grid-cols-1 gap-6">
                    {SPECS.map(([icon, title, copy]) => (
                      <div key={icon} className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-sm bg-primary-container flex items-center justify-center text-on-primary shrink-0">
                          <span aria-hidden="true" className="material-symbols-outlined">{icon}</span>
                        </div>
                        <div>
                          <h3 className="font-label-caps text-label-caps text-on-surface uppercase mb-1">
                            {t(title)}
                          </h3>
                          <p className="font-support-sm text-support-sm text-on-surface-variant">{t(copy)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-12 md:col-span-6 order-1 md:order-2 flex flex-col gap-6">
              <span className="font-label-caps text-label-caps text-primary uppercase">
                {t('Sovereign Cloud Secured')}
              </span>
              <h2 className="font-headline-lg text-headline-lg text-on-surface">
                {t('Protected by National Trust Infrastructure')}
              </h2>
              <p className="font-body-lg text-body-lg text-on-surface-variant">
                {t('Watiq is not just a portal; it is the backbone of Tunisian digital sovereignty. Our systems are audited quarterly by the ANSI to ensure the highest level of protection for citizen data.')}
              </p>
              <div className="flex gap-4">
                <img
                  alt={t('ANSI Logo')}
                  className="h-12 w-auto grayscale hover:grayscale-0 transition-all opacity-60"
                  src="/img/img-59b136c5decd.jpg"
                />
                <img
                  alt={t('Sovereign Cloud Infrastructure Logo')}
                  className="h-12 w-auto grayscale hover:grayscale-0 transition-all opacity-60"
                  src="/img/img-9d8a79b731d0.jpg"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* The Sign Language Module (TSL) is rendered by the root layout on
          every screen — this page no longer carries its own copy. */}

      <footer className="bg-on-surface dark:bg-on-background border-t border-outline dark:border-outline-variant w-full py-12 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-desktop max-w-container-max mx-auto gap-gutter">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="font-label-md text-label-md text-surface-container-lowest font-bold tracking-widest uppercase">
              {t('Watiq Portal')}
            </div>
            <p className="font-caption text-caption text-surface-container-highest opacity-60 text-center md:text-start">
              © {year} {t('Republic of Tunisia - National Services Portal')}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            {FOOTER_LINKS.map(([href, label]) => (
              <a
                key={label}
                className="font-caption text-caption text-surface-container-highest hover:text-primary-fixed hover:underline transition-all opacity-80 hover:opacity-100 focus-ring rounded"
                href={href}
              >
                {t(label)}
              </a>
            ))}
          </div>
          <div className="flex gap-4">
            <a
              aria-label={t('Watiq on social media')}
              className="text-surface-container-highest hover:text-secondary-fixed transition-colors focus-ring rounded"
              href="/contact"
            >
              {/* Material Symbols dropped brand marks, so the logo is inline
                  SVG — a ligature would render as the literal text. */}
              <svg
                aria-hidden="true"
                className="h-6 w-6"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5h1.65V3.6c-.3-.04-1.3-.1-2.45-.1-2.4 0-4.05 1.45-4.05 4.15v2.25H7.5V13h2.7v8h3.3z" />
              </svg>
            </a>
            <a
              aria-label={t('Language and accessibility options')}
              className="material-symbols-outlined text-surface-container-highest hover:text-secondary-fixed transition-colors focus-ring rounded"
              href="/accessibility"
            >
              language
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
