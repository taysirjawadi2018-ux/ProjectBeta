import SiteNav from './SiteNav.jsx';
import SiteFooter from './SiteFooter.jsx';

/**
 * Layout for screens that had no mockup of their own: nav + main + footer, all
 * from existing design-system components.
 * Port of frontend_flask/templates/_page.html.
 *
 * The ported screens do NOT use this — they carry their own chrome, which is
 * why the root layout renders neither a nav nor a footer.
 *
 * No tk-* class on purpose: :root in styles/_tokens.css already holds the value
 * each token takes on the majority of the redesigned screens, so these pages
 * inherit the house palette without pinning themselves to any one mockup's
 * overrides.
 *
 * The flash region is NOT rendered here — the root layout already drains and
 * renders it, and doing it twice would show each message once per shell.
 */
export default function PageShell({
  children,
  active,
  isAuthenticated = false,
  isStaff = false,
  unreadCount = null,
  t = (s) => s,
  wide = false,
}) {
  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col relative overflow-x-hidden font-body-md text-body-md">
      <SiteNav
        active={active}
        isAuthenticated={isAuthenticated}
        isStaff={isStaff}
        unreadCount={unreadCount}
        t={t}
      />
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
