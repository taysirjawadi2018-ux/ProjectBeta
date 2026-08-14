/**
 * The Watiq brand mark, in the two forms the screens actually need.
 * Port of frontend_flask/templates/partials/_logo.html.
 *
 * Three files back these, all derived from the master logo.png with its white
 * field converted to alpha (frontend_flask/tools/build_logo.py) so the mark can
 * sit on the navy chrome as well as on white:
 *
 *   watiq-mark.png          the arch monogram alone
 *   watiq-logo.png          monogram + "Watiq / National Portal", dark subtitle
 *   watiq-logo-inverse.png  the same lockup with a light subtitle
 *
 * The subtitle is the only thing that differs between the two lockups: it is
 * neutral grey and vanishes on #001B3D, while the red carries itself on both.
 *
 * `size` is a Tailwind height utility; width is always auto so the aspect ratio
 * survives. Decorative by default — these sit beside a text wordmark on most
 * screens, and announcing "Watiq" twice helps nobody. Pass `alt` at the one or
 * two places where the image is the only naming of the site.
 *
 * Plain <img>, not next/image: these are fixed-size PNGs served from /public,
 * and the optimiser would add a runtime dependency for no gain.
 */

export function Mark({ size = 'h-8', extra = '', alt = '' }) {
  return (
    <img
      alt={alt}
      aria-hidden={alt ? undefined : 'true'}
      className={`${size} w-auto${extra ? ` ${extra}` : ''}`}
      src="/img/watiq-mark.png"
    />
  );
}

export function Lockup({ size = 'h-8', tone = 'dark', extra = '', alt = 'Watiq National Portal' }) {
  return (
    <img
      alt={alt}
      aria-hidden={alt ? undefined : 'true'}
      className={`${size} w-auto${extra ? ` ${extra}` : ''}`}
      src={tone === 'light' ? '/img/watiq-logo-inverse.png' : '/img/watiq-logo.png'}
    />
  );
}
