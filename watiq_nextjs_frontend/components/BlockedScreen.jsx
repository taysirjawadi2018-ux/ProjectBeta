import { Mark } from './Logo.jsx';
import '@/styles/pages/error_blocked.css';

/**
 * The dedicated access-denied screen.
 * Port of frontend_flask/templates/error_blocked.html.
 *
 * 401, 403 and 429 all mean "this identity may not proceed", which is the one
 * refusal the design treats as its own screen rather than a line of body text:
 * it carries the session reference and timestamp someone has to quote when they
 * ask for the block to be reviewed.
 *
 * It renders its own header rather than the site nav, deliberately — a blocked
 * visitor is shown the state, not the navigation they cannot use.
 *
 * `now` and `reference` are passed in rather than read here so the caller
 * decides them on the server: the timestamp has to be right before, and
 * without, JavaScript.
 */
export default function BlockedScreen({ code, title, message, now, reference }) {
  return (
    <>
      <div className="national-watermark" />

      <header className="fixed top-0 start-0 w-full h-20 px-margin-desktop flex items-center justify-between z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 flex items-center justify-center bg-on-surface text-surface rounded-sm">
            <span className="icon-filled material-symbols-outlined">policy</span>
          </div>
          <Mark size="h-9" />
          <div className="flex flex-col">
            <span className="font-headline-md text-headline-md tracking-wider uppercase text-on-surface leading-tight">
              République Tunisienne
            </span>
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              Portail National des Services
            </span>
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-screen flex items-center justify-center px-margin-mobile md:px-0 py-24">
        <div className="max-w-2xl w-full flex flex-col items-center">
          {/* Sovereign seal / visual anchor */}
          <div className="relative mb-12">
            <div className="absolute inset-0 bg-error opacity-5 blur-3xl rounded-full scale-150" />
            <div className="relative w-32 h-32 md:w-48 md:h-48 rounded-full border-4 border-error/20 p-2 flex items-center justify-center">
              <div className="w-full h-full rounded-full border-2 border-error/40 p-4 flex items-center justify-center bg-surface-container-lowest shadow-2xl">
                <span className="icon-filled material-symbols-outlined text-error !text-[64px] md:!text-[80px]">
                  gavel
                </span>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-xl p-8 md:p-12 w-full shadow-lg relative overflow-hidden text-center border-t-4 border-error">
            <div className="scanline" />
            <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2 uppercase tracking-tight">
              {title}
            </h1>
            <p className="font-headline-md text-headline-md text-error mb-8">
              Security Protocol v2.4 Active
            </p>

            <div className="bg-surface-container-high rounded-sm p-6 mb-10 text-start border-s-4 border-on-surface">
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center border-b border-outline-variant pb-3">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    Reason for Restriction
                  </span>
                  <span className="font-body-md text-body-md font-bold text-on-surface">
                    {title}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-outline-variant pb-3">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    Timestamp
                  </span>
                  <span className="font-body-md text-body-md text-on-surface" id="current-time">
                    {now}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-label-caps text-label-caps text-on-surface-variant">
                    Reference ID
                  </span>
                  <span className="font-body-md text-body-md font-bold text-primary tracking-widest bg-secondary-container px-2 py-1 rounded-sm">
                    {code}-{reference}
                  </span>
                </div>
              </div>
            </div>

            <p className="font-body-lg text-body-lg text-on-surface-variant mb-10 max-w-lg mx-auto">
              {message}
            </p>

            {/* Three ways out, not two: appeal the block, try a different
                identity, or leave. The middle one matters — without it, someone
                whose only problem is being signed in as the wrong account has
                nowhere to go but the support desk. */}
            <div className="flex flex-col md:flex-row gap-gutter justify-center items-center">
              <a
                href="/contact"
                className="w-full md:w-auto px-10 py-4 bg-primary text-on-primary font-headline-md text-headline-md rounded-sm hover:bg-on-surface-variant transition-all active:scale-95 flex items-center justify-center gap-3 focus-ring"
              >
                <span className="material-symbols-outlined">send</span>
                Lodge Official Appeal
              </a>
              <a
                href="/login"
                className="w-full md:w-auto px-10 py-4 border-2 border-primary text-primary font-headline-md text-headline-md rounded-sm hover:bg-surface-container-highest transition-all active:scale-95 flex items-center justify-center gap-3 focus-ring"
              >
                <span className="material-symbols-outlined">account_circle</span>
                Sign in as someone else
              </a>
              <a
                href="/"
                className="w-full md:w-auto px-10 py-4 text-on-surface-variant font-headline-md text-headline-md rounded-sm hover:bg-surface-container-highest transition-all active:scale-95 flex items-center justify-center gap-3 focus-ring"
              >
                <span className="material-symbols-outlined">account_balance</span>
                Return to the portal
              </a>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="font-support-sm text-support-sm text-on-surface-variant opacity-60 flex items-center justify-center gap-2">
              <span className="material-symbols-outlined !text-[16px]">verified_user</span>
              Secured by National Cybersecurity Agency (ANSI) &amp; Ministry of Justice
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
