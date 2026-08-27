/**
 * The sign-language interpreter slot, rendered once from the root layout so
 * it floats over every screen.
 *
 * The design system mandates a reserved overlay slot for a TSL interpreter
 * feed across the primary citizen journeys. Screens scripted in
 * sign_language_videos_guide.pdf carry their own clip, resolved per request by
 * lib/tsl.js and passed in as `src`; every other screen still renders the
 * placeholder — a framed video region with the interpreter poster and an
 * explicit "coming soon" badge. Either way the full control set that
 * public/js/watiq.js ships actions for (a11y-play/-pause, -mute/-unmute,
 * -expand, -close) is present and bound.
 *
 * Wiring notes, so the panel keeps working as it evolves:
 *   - id="tsl-module" and class "SignLanguageModule" are load-bearing:
 *     watiq.js resolves controls through #tsl-module/.tsl-module selectors,
 *     and public/js/pages/error_maintenance.js greps for .SignLanguageModule.
 *   - Clips live in public/video/tsl/ and are chosen by route in lib/tsl.js.
 *     watiq.js resolves the media as panel.querySelector('video, audio'), so a
 *     filled src makes every control work with no change on its side.
 *   - preload="metadata" is deliberate: the panel is chrome on every screen,
 *     and only the citizen who opens it should pay for the download.
 *   - Bottom-end corner, mirroring A11yControls on the bottom-start corner;
 *     both carry logical (start/end) offsets so RTL flips them together.
 */

const POSTER = '/img/img-091ffb278e7e.jpg';

const CONTROL =
  'flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors focus-ring';

function ControlButton({ action, icon, label, pressed, t }) {
  return (
    <button
      aria-label={t(label)}
      aria-pressed={pressed}
      className={CONTROL}
      data-action={action}
      title={t(label)}
      type="button"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">
        {icon}
      </span>
    </button>
  );
}

export default function SignLanguageModule({ src = '', t = (s) => s }) {
  return (
    <aside
      aria-label={t('Tunisian Sign Language interpreter')}
      className="SignLanguageModule fixed bottom-margin-mobile end-margin-mobile z-[100] print:hidden"
      id="tsl-module"
    >
      <div className="tsl-video-frame relative rounded-xl shadow-2xl glass-panel border-2 border-secondary-fixed overflow-hidden bg-surface-container-lowest">
        <span className="absolute top-2 start-2 z-10 inline-flex items-center gap-1 rounded-sm bg-primary-container/90 px-2 py-0.5 font-label-caps text-[10px] uppercase tracking-wider text-on-primary">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-secondary-fixed animate-pulse" />
          {t('TSL')}
        </span>

        {/* Controls bind through data-action; see public/js/watiq.js. */}
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between bg-surface-container-lowest/90 px-1 py-1 backdrop-blur">
          <ControlButton action="a11y-play" icon="play_arrow" label="Play the sign language video" t={t} />
          <ControlButton action="a11y-mute" icon="volume_off" label="Mute the sign language video" t={t} />
          <ControlButton action="a11y-expand" icon="open_in_full" label="Enlarge the sign language panel" t={t} />
          <ControlButton action="a11y-close" icon="close" label="Hide the sign language panel" t={t} />
        </div>

        <video
          aria-label={t('Sign language interpreter feed')}
          className="block h-full w-full aspect-[1.79] object-cover"
          loop
          muted
          playsInline
          poster={POSTER}
          preload="metadata"
          src={src || undefined}
        />

        {/* Only for screens the guide has not scripted a clip for yet. */}
        {!src && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-3 text-center">
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              {t('Interpreter video coming soon')}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
