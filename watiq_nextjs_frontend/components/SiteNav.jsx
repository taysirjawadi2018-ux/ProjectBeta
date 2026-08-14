import { Lockup } from './Logo.jsx';
import { logoutAction } from '@/lib/actions.js';

/**
 * Shared navigation for screens that had no design of their own (request
 * detail, appointments, payments, tracking, the content pages, the staff and
 * admin screens). Port of frontend_flask/templates/partials/_nav.html.
 *
 * This is the national-portal header from the redesign, rebuilt against real
 * routes. The ported screens keep their own headers — the mockups use four
 * distinct chrome archetypes and this component does not touch them, which is
 * why it is NOT rendered by the root layout.
 *
 * `unreadCount` reads `unread_count` from the API, not `count`. Reading the
 * wrong key made the badge permanently 0 and therefore never rendered.
 */

const ITEMS = [
  ['services', '/services', 'Services'],
  ['requests', '/requests', 'My Requests'],
  ['appointments', '/appointments', 'Appointments'],
  ['payments', '/payments', 'Payments'],
];

export default function SiteNav({
  active,
  isAuthenticated = false,
  isStaff = false,
  unreadCount = null,
  t = (s) => s,
}) {
  return (
    <header className="bg-primary-container sticky top-0 w-full z-50 border-b border-outline-variant/20">
      <nav
        aria-label={t('Primary')}
        className="flex justify-between items-center w-full px-margin-mobile md:px-gutter py-3 max-w-container-max mx-auto"
      >
        <div className="flex items-center gap-6">
          <a aria-label={t('Watiq home')} className="flex items-center focus-ring rounded" href="/">
            <Lockup size="h-9" tone="light" />
          </a>
          <div className="hidden md:flex gap-6">
            {ITEMS.map(([key, href, label]) =>
              key === active ? (
                <a
                  key={key}
                  aria-current="page"
                  className="font-body-md text-body-md text-primary-fixed border-b-2 border-tertiary-fixed-dim pb-1 transition-colors focus-ring rounded"
                  href={href}
                >
                  {t(label)}
                </a>
              ) : (
                <a
                  key={key}
                  className="font-body-md text-body-md text-on-primary-container opacity-80 hover:text-primary-fixed transition-colors focus-ring rounded"
                  href={href}
                >
                  {t(label)}
                </a>
              ),
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
            className="p-2 text-on-primary-container hover:text-primary-fixed transition-colors rounded-full focus-ring relative"
            href="/notifications"
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              notifications
            </span>
            {unreadCount ? (
              <span className="absolute -top-0.5 -end-0.5 bg-tertiary-fixed-dim text-on-tertiary-fixed font-label-sm text-label-sm rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                {unreadCount}
              </span>
            ) : null}
          </a>

          <a
            aria-label={t('Accessibility settings')}
            className="p-2 text-on-primary-container hover:text-primary-fixed transition-colors rounded-full focus-ring"
            href="/accessibility"
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              record_voice_over
            </span>
          </a>

          {isAuthenticated ? (
            <>
              <a
                className="hidden sm:inline-flex font-label-sm text-label-sm text-on-primary-container hover:text-primary-fixed px-3 py-2 rounded focus-ring transition-colors"
                href={isStaff ? '/staff' : '/profile'}
              >
                {t(isStaff ? 'Workbench' : 'Profile')}
              </a>
              {/* A form, not a link: signing out is a state change, and a GET
                  that signs you out is followed by every link prefetcher. */}
              <form action={logoutAction} className="inline">
                <button
                  aria-label={t('Sign out')}
                  className="p-2 text-on-primary-container hover:text-primary-fixed transition-colors rounded-full focus-ring"
                  type="submit"
                >
                  <span aria-hidden="true" className="material-symbols-outlined">
                    logout
                  </span>
                </button>
              </form>
            </>
          ) : (
            <a
              className="font-label-sm text-label-sm text-primary-fixed border border-outline-variant/40 hover:bg-white/5 px-4 py-2 rounded focus-ring transition-colors"
              href="/login"
            >
              {t('Sign In')}
            </a>
          )}
        </div>
      </nav>
    </header>
  );
}
