import { Lockup } from './Logo.jsx';
import { displayName } from '@/lib/format.js';
import { logoutAction } from '@/lib/actions.js';

/**
 * Back-office chrome. The navy sidebar layout from the workbench mockup,
 * rebuilt against real routes.
 *
 * Distinct from PageShell on purpose — the staff screens are a different
 * archetype, and the citizen nav's "My Requests / Appointments / Payments"
 * means nothing to an officer working a queue.
 *
 * `permissions` gates what is shown, but only cosmetically: the API is what
 * actually enforces them, and a clerk who types /staff/audit still gets its
 * 403. Hiding a control the caller cannot use is a courtesy, not a control.
 */

const ITEMS = [
  ['workbench', '/staff', 'inbox', 'Workbench'],
  ['review', '/staff/review', 'fact_check', 'Review'],
  ['appointments', '/staff/appointments', 'event', 'Appointments'],
  ['audit', '/staff/audit', 'policy', 'Access log'],
  ['health', '/staff/health', 'monitor_heart', 'System health'],
];

export default function StaffShell({ children, active, staff, role, t = (s) => s }) {
  const isAdmin = ['admin', 'director'].includes(String(role));

  return (
    <div className="min-h-screen flex bg-surface-container-low">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-primary-container text-white">
        <div className="p-6 border-b border-white/10">
          <a className="flex items-center focus-ring rounded" href="/">
            <Lockup size="h-9" tone="light" />
          </a>
          <p className="mt-3 font-label-caps text-label-caps uppercase tracking-widest text-white/60">
            {t('Back office')}
          </p>
        </div>

        <nav aria-label={t('Back office')} className="flex-1 p-4 space-y-1">
          {ITEMS.map(([key, href, icon, label]) => (
            <a
              key={key}
              aria-current={key === active ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg font-label-md text-label-md transition-colors focus-ring ${
                key === active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              href={href}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">{icon}</span>
              {t(label)}
            </a>
          ))}

          {isAdmin && (
            <a
              aria-current={active === 'admin' ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg font-label-md text-label-md transition-colors focus-ring ${
                active === 'admin' ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              href="/admin"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
              {t('Administration')}
            </a>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          {staff && (
            <div>
              <p className="font-body-md text-body-md text-white">{displayName(staff)}</p>
              <p className="font-support-sm text-support-sm text-white/60">
                {staff.role_name}
                {staff.office_name ? ` · ${staff.office_name}` : ''}
              </p>
            </div>
          )}
          <form action={logoutAction}>
            <button
              className="w-full inline-flex items-center gap-2 border border-white/20 px-4 py-2.5 rounded font-label-md text-label-md text-white/80 hover:bg-white/10 transition-colors focus-ring"
              type="submit"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">logout</span>
              {t('Sign out')}
            </button>
          </form>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* The sidebar is hidden below md, so the same links have to exist here
            or the whole back office is unreachable on a phone. */}
        <nav
          aria-label={t('Back office')}
          className="md:hidden bg-primary-container text-white px-4 py-3 flex gap-1 overflow-x-auto"
        >
          {ITEMS.map(([key, href, , label]) => (
            <a
              key={key}
              aria-current={key === active ? 'page' : undefined}
              className={`whitespace-nowrap px-3 py-2 rounded font-label-sm text-label-sm focus-ring ${
                key === active ? 'bg-white/15' : 'text-white/70'
              }`}
              href={href}
            >
              {t(label)}
            </a>
          ))}
        </nav>

        <main id="main" className="flex-1 p-margin-mobile md:p-margin-desktop space-y-8 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
