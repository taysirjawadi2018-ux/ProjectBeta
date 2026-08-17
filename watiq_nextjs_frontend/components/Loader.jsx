import { Mark } from './Logo.jsx';

/**
 * The splash panel. Port of frontend_flask/templates/partials/_loader.html.
 *
 * watiq.js fades it out on load. It is rendered rather than script-injected so
 * there is no flash of unstyled content before the script runs — and because it
 * is opacity-based, a browser that never runs the script would be left staring
 * at it, which is why watiq.js removes it on DOMContentLoaded rather than on a
 * timer or a load event that a stalled image can hold open.
 */
export default function Loader({ t = (s) => s }) {
  return (
    <div
      id="watiq-preloader"
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-[#001b3d] text-white transition-opacity duration-500 ease-out opacity-100 print:hidden"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center p-3 border border-white/20 shadow-2xl backdrop-blur-md animate-pulse">
          <Mark size="h-12" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl font-bold tracking-tight text-white">
            Watiq <span className="text-sovereign-gold font-light">Pro</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-white/70 font-semibold">
            {t('Republic of Tunisia')}
          </span>
        </div>
        <div className="w-36 h-1 bg-white/20 rounded-full overflow-hidden mt-3">
          <div className="h-full bg-sovereign-gold animate-pulse w-full" />
        </div>
      </div>
    </div>
  );
}
