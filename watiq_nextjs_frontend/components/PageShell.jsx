import SiteFooter from './SiteFooter.jsx';

/**
 * Layout for screens that had no mockup of their own: main + footer.
 *
 * The navigation bar is NOT rendered here — the root layout renders the one
 * universal nav for every screen, and a second one here would put two bars on
 * each of these pages. This shell only owns the content column and the footer.
 *
 * No tk-* class on purpose: :root in styles/_tokens.css already holds the value
 * each token takes on the majority of the redesigned screens, so these pages
 * inherit the house palette without pinning themselves to any one mockup's
 * overrides.
 *
 * The flash region is NOT rendered here — the root layout already drains and
 * renders it, and doing it twice would show each message once per shell.
 */
export default function PageShell({ children, wide = false, t = (s) => s }) {
  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col relative overflow-x-hidden font-body-md text-body-md">
      <main
        id="main"
        className={`flex-grow w-full ${wide ? '' : 'max-w-container-max'} mx-auto px-margin-mobile md:px-gutter py-margin-desktop space-y-8`}
      >
        {children}
      </main>
      <SiteFooter t={t} />
    </div>
  );
}
