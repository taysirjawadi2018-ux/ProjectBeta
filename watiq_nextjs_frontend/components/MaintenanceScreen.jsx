import '@/styles/pages/error_maintenance.css';

/**
 * The service-unavailable screen, for 502/503/504.
 * Port of frontend_flask/templates/error_maintenance.html.
 *
 * Reached when the records service is unreachable or answering with a fault,
 * which is not the citizen's problem and not something a "try again" button can
 * fix — so the screen offers the status page, the priority support line, and
 * the parts of the portal that are still up, rather than a retry.
 *
 * The navigation bar is the universal one from the root layout — it reads only
 * session cookies, so it still renders while the API is down.
 */
export default function MaintenanceScreen({ title, message, year = new Date().getFullYear() }) {
  return (
    <>
      <div className="bg-asset-error-maintenance-1 emblem-watermark" />

      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-container-max-width px-margin-mobile md:px-margin-desktop z-10 text-center">
        <div className="mb-unit-4 flex items-center gap-unit-2 bg-secondary-container/20 border border-secondary-fixed text-on-secondary-container px-unit-3 py-unit-1 rounded-full status-pulse">
          <span className="icon-filled material-symbols-outlined text-[18px]">update</span>
          <span className="font-label-caps text-label-caps">Scheduled Infrastructure Update</span>
        </div>

        <h1 className="font-headline-lg text-headline-lg text-on-primary-container max-w-4xl mb-unit-3">
          {title}
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mb-unit-8">
          {message}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter w-full max-w-5xl">
          <div className="md:col-span-7 glass-panel rounded-xl p-gutter flex flex-col items-start text-start shadow-md">
            <span className="font-label-caps text-label-caps text-secondary mb-unit-2">
              EXPECTED SERVICE RESTORATION
            </span>
            <div className="flex items-baseline gap-unit-1 mb-unit-4">
              <span className="font-headline-lg text-headline-lg" id="countdown">
                04:00
              </span>
              <span className="font-headline-md text-headline-md text-on-surface-variant">UTC</span>
            </div>
            <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mb-unit-2">
              <div className="bg-primary-container h-full w-2/3 transition-all duration-1000" />
            </div>
            <p className="font-support-sm text-support-sm text-on-surface-variant">
              Current Progress: 68% - Security layers successfully validated.
            </p>
          </div>

          <div className="md:col-span-5 flex flex-col gap-unit-2">
            {/* Re-requesting this page IS the refresh: the status is probed
                upstream on every render, so the card reports the API as it is
                now rather than as it was when the page was first opened. */}
            <a
              className="group glass-panel rounded-xl p-unit-3 flex items-center justify-between hover:bg-primary-container hover:text-white transition-all duration-300 shadow-sm focus-ring"
              href="/status"
            >
              <div className="flex items-center gap-unit-3">
                <div className="w-10 h-10 rounded-sm bg-surface-container-highest flex items-center justify-center group-hover:bg-on-primary-container">
                  <span className="material-symbols-outlined">dashboard</span>
                </div>
                <div className="text-start">
                  <p className="font-label-caps text-label-caps text-on-surface-variant group-hover:text-white/70">
                    REAL-TIME UPDATES
                  </p>
                  <p className="font-body-md text-body-md font-bold">Refresh Status</p>
                </div>
              </div>
              <span className="material-symbols-outlined transition-transform group-hover:rotate-180 duration-500">
                refresh
              </span>
            </a>

            <a
              className="group border border-primary-container/20 rounded-xl p-unit-3 flex items-center justify-between hover:bg-primary-container hover:text-white transition-all duration-300 shadow-sm bg-white focus-ring"
              href="/contact"
            >
              <div className="flex items-center gap-unit-3">
                <div className="w-10 h-10 rounded-sm bg-primary-container flex items-center justify-center text-white">
                  <span className="material-symbols-outlined">support_agent</span>
                </div>
                <div className="text-start">
                  <p className="font-label-caps text-label-caps text-on-surface-variant group-hover:text-white/70">
                    JUDICIAL EMERGENCY
                  </p>
                  <p className="font-body-md text-body-md font-bold">Priority Support Line</p>
                </div>
              </div>
              <span className="material-symbols-outlined transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                phone_in_talk
              </span>
            </a>

            <a
              className="group border border-primary-container/20 rounded-xl p-unit-3 flex items-center justify-between hover:bg-primary-container hover:text-white transition-all duration-300 shadow-sm bg-white focus-ring"
              href="/"
            >
              <div className="flex items-center gap-unit-3">
                <div className="w-10 h-10 rounded-sm bg-primary-container flex items-center justify-center text-white">
                  <span className="material-symbols-outlined">account_balance</span>
                </div>
                <div className="text-start">
                  <p className="font-label-caps text-label-caps text-on-surface-variant group-hover:text-white/70">
                    UNAFFECTED SERVICES
                  </p>
                  <p className="font-body-md text-body-md font-bold">Check National Portal</p>
                </div>
              </div>
              <span className="material-symbols-outlined transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                arrow_forward
              </span>
            </a>
          </div>
        </div>
      </main>

      <footer className="w-full bg-primary-container text-on-primary-container flex flex-col md:flex-row justify-between items-center px-margin-desktop py-gutter z-10">
        <div className="flex flex-col md:flex-row items-center gap-unit-4">
          <span className="font-label-caps text-label-caps uppercase text-secondary-fixed">
            DIGITAL SOVEREIGNTY UNIT
          </span>
          <p className="font-support-sm text-support-sm text-white/60">
            © {year} Republic of Tunisia. All Rights Reserved.
          </p>
        </div>
        <div className="flex gap-unit-4 mt-unit-2 md:mt-0">
          <a
            className="font-support-sm text-support-sm text-white/60 hover:text-secondary-fixed transition-colors focus-ring"
            href="/legal/terms"
          >
            Security Protocol
          </a>
          <a
            className="font-support-sm text-support-sm text-white/60 hover:text-secondary-fixed transition-colors focus-ring"
            href="/open-data"
          >
            Official Gazettes
          </a>
        </div>
      </footer>
    </>
  );
}
