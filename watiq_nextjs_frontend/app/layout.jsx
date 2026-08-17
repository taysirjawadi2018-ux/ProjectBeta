import { headers } from 'next/headers';
import './globals.css';
import { readPrefs } from '@/lib/prefs.js';
import { takeFlashes } from '@/lib/flash.js';
import { getTranslator } from '@/lib/i18n.js';
import Loader from '@/components/Loader.jsx';
import Flash from '@/components/Flash.jsx';
import A11yControls from '@/components/A11yControls.jsx';

/**
 * Shared shell for every Watiq screen. Port of
 * frontend_flask/templates/base.html.
 *
 * Only the parts that were provably identical across all the source pages live
 * here: the document scaffold, the stylesheet, the preloader, the flash region
 * and the reader controls. Navigation bars and footers are NOT shared — the
 * source screens use seven distinct nav variants and five distinct footers, so
 * hoisting them would silently change the design. Each page renders its own
 * (components/SiteNav.jsx and SiteFooter.jsx are the variant for the screens
 * that had no design of their own).
 *
 * Everything loaded here is same-origin on purpose. The CSP is
 *
 *     default-src 'none'; script-src 'self' 'nonce-…' 'strict-dynamic';
 *     style-src 'self'; font-src 'self'; img-src 'self' data:
 *
 * which rejects all four things the mockups loaded in this head: the Tailwind
 * Play CDN script, its inline config block, and the two Google Fonts sheets.
 * The tokens compile into the stylesheet and the fonts are vendored.
 */

// Applies to every route beneath this layout, which is all of them.
//
// Two reasons, either of which is sufficient. The BFF renders per request —
// session, locale, theme and text scale all come from cookies — so a
// prerendered page would be one citizen's view served to the next. And the CSP
// nonce in middleware.js only reaches <script> tags that are rendered at
// request time: a statically prerendered page keeps the build-time HTML, whose
// scripts carry no nonce, and the browser refuses all of them. That failure is
// a blank page with a console error and nothing in the server log.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Watiq National Portal',
  description:
    'Official digitized citizen services, procedures, document verification, and appointment booking portal.',
  // Brand marks, all same-origin so `img-src 'self' data:` keeps holding. The
  // ICO carries 16/32/48 for browsers that ignore the PNG hints, and the 180px
  // Apple icon is the one variant rendered on white: iOS composites touch icons
  // onto an opaque tile, so a transparent mark there would sit on whatever it
  // likes.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/img/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/img/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/img/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/site.webmanifest',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#001b3d',
};

export default async function RootLayout({ children }) {
  const { locale, dir, theme, textScale, themeClass, textScaleClass } = await readPrefs();
  const t = await getTranslator();
  const messages = await takeFlashes();

  const requestHeaders = await headers();
  // Set by middleware.js. Every <script> this layout renders must carry it:
  // 'strict-dynamic' makes browsers that honour it ignore 'self' for
  // script-src, so an un-nonced same-origin script is refused.
  const nonce = requestHeaders.get('x-nonce') ?? undefined;

  // Where the reader controls return to when they post without JavaScript.
  // Keeps the query string, so a filtered list comes back still filtered.
  const next =
    requestHeaders.get('x-invoke-path') ||
    requestHeaders.get('x-matched-path') ||
    requestHeaders.get('referer')?.replace(/^https?:\/\/[^/]+/, '') ||
    '/';

  // `light` is kept even in dark mode — it is inert (only .dark is wired to
  // darkMode: 'class') and several checks look for one of tk-/light/dark here.
  // The reader's theme and text size join it server-side rather than being
  // applied by a script on load: `script-src 'self'` rules out the inline head
  // script that normally prevents the flash of the wrong theme, and the server
  // already knows the answer from the cookie.
  const rootClasses = ['light', themeClass, textScaleClass].filter(Boolean).join(' ');

  return (
    <html className={rootClasses} dir={dir} lang={locale}>
      <body>
        <Loader t={t} />
        <Flash messages={messages} />
        {children}
        {/* Last in the body so it is last in the tab order — it is chrome, and
            should not sit between the skip target and the page's own content. */}
        <A11yControls
          locale={locale}
          theme={theme}
          textScale={textScale}
          next={next}
          t={t}
        />
        <script src="/js/watiq.js" defer nonce={nonce} />
      </body>
    </html>
  );
}
