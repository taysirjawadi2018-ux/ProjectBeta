import PageShell from './PageShell.jsx';

/**
 * The informational pages (privacy, accessibility, about, open data).
 * Port of frontend_flask/templates/content_page.html.
 *
 * These had no mockup. The copy is placeholder text that a content owner is
 * expected to replace, and the page SAYS SO rather than pretending to be a
 * finished legal notice — a plausible-looking privacy policy nobody wrote is
 * worse than an obvious placeholder, because nobody goes looking for it.
 */

const BLURBS = {
  privacy: 'How the Watiq National Portal collects, uses and protects your personal data.',
  terms: 'The conditions that apply when you use this platform.',
  accessibility: 'Our commitment to making government services usable by everyone.',
  about: 'What the Watiq National Portal is and who operates it.',
  'open-data': 'Datasets the Republic publishes for reuse, and the terms they carry.',
};

export default function ContentPage({ slug, title, ctx, children }) {
  const { t } = ctx;

  return (
    <PageShell {...ctx}>
      <article className="max-w-3xl mx-auto space-y-8">
        <header className="border-b border-surface-variant pb-6">
          <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg text-on-surface mb-4">
            {t(title)}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {t(BLURBS[slug] ?? 'Guidance for using the portal, and what to do when something goes wrong.')}
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

        {children}
      </article>
    </PageShell>
  );
}
