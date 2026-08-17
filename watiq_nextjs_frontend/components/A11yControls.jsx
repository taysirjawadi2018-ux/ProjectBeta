import { LANGUAGES, TEXT_SCALES } from '@/lib/prefs.js';

/**
 * Reader controls: language, colour scheme and text size.
 * Port of frontend_flask/templates/partials/_a11y.html.
 *
 * Rendered once from the root layout, which is the only thing all 38 screens
 * share — the site has seven nav archetypes and several screens (login, MFA,
 * blocked, maintenance, the payment receipt) with no chrome at all to hang a
 * button on.
 *
 * Bottom-left, because the sign-language module already occupies bottom-right
 * on eight of these pages.
 *
 * It is a real form posting to /api/preferences, not a pair of script hooks.
 * The people the text-size control exists for are the least likely to be on a
 * current browser, so it has to work before watiq.js has loaded and still work
 * if it never does; watiq.js upgrades it to apply the change without a reload.
 *
 * Selected state is carried by aria-pressed, so the enhancement only has to
 * flip an attribute rather than juggle utility classes. Language is the one
 * control that always round-trips: its output is server-rendered markup.
 *
 * No CSRF token. Flask carried one because Flask-WTF protected every POST;
 * this route only writes three cookies from a closed set of values, holds no
 * authority, and a forged post can at worst change a stranger's text size.
 * Requiring a token here would instead break the control for the anonymous
 * readers it exists for, who have no session to hold one.
 */

const SIZES = [
  [100, 'Normal text size', 'text-[13px]'],
  [125, 'Large text size', 'text-[15px]'],
  [150, 'Very large text size', 'text-[18px]'],
];

export default function A11yControls({ locale, theme, textScale, next = '/', t = (s) => s }) {
  return (
    <form
      action="/api/preferences"
      aria-label={t('Display settings')}
      className="fixed bottom-4 start-4 z-[200] flex items-stretch gap-1 rounded-full border border-outline-variant bg-surface-container-lowest/95 p-1 shadow-lg backdrop-blur print:hidden"
      data-a11y-controls
      method="post"
    >
      {/* Where to return to when this posts without JavaScript. Includes the
          query string, so a filtered list comes back still filtered. */}
      <input name="next" type="hidden" value={next} />

      <button
        aria-pressed={theme === 'dark' ? 'true' : 'false'}
        className="flex items-center rounded-full px-3 py-2 text-on-surface transition-colors hover:bg-surface-container-high focus-ring"
        data-a11y-theme
        name="theme"
        title={t('Switch colour theme')}
        type="submit"
        value={theme === 'dark' ? 'light' : 'dark'}
      >
        {/* Inline SVG rather than a ligature: the Material Symbols woff2 is
            subsetted to the glyphs found in the templates and carries
            light_mode but not dark_mode, and re-subsetting needs the network.
            Both are rendered so the enhancement can swap them without building
            markup. */}
        <svg
          aria-hidden="true"
          className={`h-5 w-5${theme === 'dark' ? ' hidden' : ''}`}
          data-a11y-icon="dark"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M21.6 13.4A9 9 0 1 1 10.6 2.4a7 7 0 1 0 11 11z" />
        </svg>
        <svg
          aria-hidden="true"
          className={`h-5 w-5${theme !== 'dark' ? ' hidden' : ''}`}
          data-a11y-icon="light"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1zm0 17a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1zM4.2 4.2a1 1 0 0 1 1.4 0l1.5 1.5a1 1 0 0 1-1.4 1.4L4.2 5.6a1 1 0 0 1 0-1.4zm12.7 12.7a1 1 0 0 1 1.4 0l1.5 1.5a1 1 0 0 1-1.4 1.4l-1.5-1.5a1 1 0 0 1 0-1.4zM2 12a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1zm17 0a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1zM4.2 19.8a1 1 0 0 1 0-1.4l1.5-1.5a1 1 0 1 1 1.4 1.4l-1.5 1.5a1 1 0 0 1-1.4 0zM16.9 7.1a1 1 0 0 1 0-1.4l1.5-1.5a1 1 0 1 1 1.4 1.4l-1.5 1.5a1 1 0 0 1-1.4 0z" />
        </svg>
        {/* A toggle button's name stays put and aria-pressed carries the state:
            "Dark theme, pressed" is unambiguous, where a name that changes with
            the state announces as "Switch to light theme, pressed" and leaves
            the listener to work out which theme is actually on. */}
        <span className="sr-only">{t('Dark theme')}</span>
      </button>

      <span aria-hidden="true" className="my-1 w-px bg-outline-variant" />

      {/* Language. Unlike theme and text size this cannot be applied in the
          browser: the translated markup is rendered server-side, so choosing a
          language is a real navigation. These stay plain submits and watiq.js
          leaves them alone.

          Each name is written in its own language — someone hunting for Arabic
          is looking for "العربية", not for the word "Arabic" in a script they
          may not read — and lang= on the button tells a screen reader to switch
          voice. */}
      <div aria-label={t('Language')} className="flex items-center gap-1" role="group">
        {Object.entries(LANGUAGES).map(([code, meta]) => (
          <button
            key={code}
            aria-pressed={locale === code ? 'true' : 'false'}
            className={`flex h-9 items-center justify-center rounded-full px-2.5 font-bold leading-none transition-colors focus-ring ${
              locale === code
                ? 'bg-primary-container text-primary-fixed'
                : 'text-on-surface hover:bg-surface-container-high'
            }`}
            lang={code}
            name="lang"
            title={meta.native}
            type="submit"
            value={code}
          >
            <span aria-hidden="true" className="text-[12px] uppercase tracking-wide">
              {code}
            </span>
            <span className="sr-only">{meta.native}</span>
          </button>
        ))}
      </div>

      <span aria-hidden="true" className="my-1 w-px bg-outline-variant" />

      <div
        aria-label={t('Text size')}
        className="flex items-center gap-1"
        data-a11y-sizes
        role="group"
      >
        {SIZES.map(([value, label, size]) => (
          <button
            key={value}
            aria-pressed={textScale === value ? 'true' : 'false'}
            className="flex h-9 w-9 items-center justify-center rounded-full font-bold leading-none text-on-surface transition-colors hover:bg-surface-container-high focus-ring"
            name="text_scale"
            title={t(label)}
            type="submit"
            value={value}
          >
            <span aria-hidden="true" className={size}>
              A
            </span>
            <span className="sr-only">{t(label)}</span>
          </button>
        ))}
      </div>
    </form>
  );
}

// Re-exported so a test can assert the control offers exactly the scales the
// stylesheet has classes for.
export { TEXT_SCALES };
