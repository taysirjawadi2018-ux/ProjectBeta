import { Lockup } from './Logo.jsx';
import { logoutAction } from '@/lib/actions.js';

/**
 * The one navigation bar, rendered once by the root layout for every screen.
 * Port of frontend_flask/templates/partials/_nav.html.
 *
 * Role-aware rather than duplicated: a signed-in officer gets the back-office
 * sections in the same bar a citizen gets the citizen ones in — there is no
 * second chrome to keep in sync. The API still enforces everything; the bar
 * only shows what the current session can meaningfully click.
 *
 * `unreadCount` reads `unread_count` from the API, not `count`. Reading the
 * wrong key made the badge permanently 0 and therefore never rendered.
 */

const CITIZEN_ITEMS = [
  ['services', '/services', 'Services'],
  ['requests', '/requests', 'My Requests'],
  ['appointments', '/appointments', 'Appointments'],
  ['payments', '/payments', 'Payments'],
];

const STAFF_ITEMS = [
  ['workbench', '/staff', 'Workbench'],
  ['review', '/staff/review', 'Review'],
  ['appointments', '/staff/appointments', 'Appointments'],
  ['audit', '/staff/audit', 'Access log'],
  ['health', '/staff/health', 'System health'],
];

const ADMIN_ITEM = ['admin', '/admin', 'Administration'];

function isActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav({
  pathname = '/',
  isAuthenticated = false,
  isStaff = false,
  isAdmin = false,
  unreadCount = null,
  t = (s) => s,
}) {
  const items = isStaff
    ? isAdmin
      ? [...STAFF_ITEMS, ADMIN_ITEM]
      : STAFF_ITEMS
    : CITIZEN_ITEMS;

  return (
    <header className="bg-primary-container sticky top-0 w-full z-50 border-b border-outline-variant/20 print:hidden">
      <nav
        aria-label={t('Primary')}
        className="flex justify-between items-center w-full px-margin-mobile md:px-gutter py-3 max-w-container-max mx-auto"
      >
        <div className="flex items-center gap-6">
          <a aria-label={t('Watiq home')} className="flex items-center focus-ring rounded" href="/">
            <Lockup size="h-9" tone="light" />
          </a>
          <div className="hidden md:flex gap-6">
            {items.map(([key, href, label]) =>
              isActive(pathname, href) ? (
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
          {/* The unread badge is a citizen concern — an officer's queue is the
              workbench itself, so staff do not get notification counts. */}
          {!isStaff && (
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
          )}

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
                href={isStaff ? (isAdmin ? '/admin' : '/staff') : '/profile'}
              >
                {t(isStaff ? (isAdmin ? 'Administration' : 'Workbench') : 'Profile')}
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
            <>
              <a
                className="hidden sm:inline-flex font-label-sm text-label-sm text-on-primary-container opacity-80 hover:text-primary-fixed px-3 py-2 rounded focus-ring transition-colors"
                href="/register"
              >
                {t('Register')}
              </a>
              <a
                className="font-label-sm text-label-sm text-primary-fixed border border-outline-variant/40 hover:bg-white/5 px-4 py-2 rounded focus-ring transition-colors"
                href="/login"
              >
                {t('Sign In')}
              </a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
