import { headers } from 'next/headers';
import './globals.css';
import { readPrefs } from '@/lib/prefs.js';
import { takeFlashes } from '@/lib/flash.js';
import { getTranslator } from '@/lib/i18n.js';
import { pageContext } from '@/lib/page.js';
import { role } from '@/lib/auth.js';
import Loader from '@/components/Loader.jsx';
import Flash from '@/components/Flash.jsx';
import A11yControls from '@/components/A11yControls.jsx';
import SignLanguageModule from '@/components/SignLanguageModule.jsx';
import SiteNav from '@/components/SiteNav.jsx';

/**
 * Shared shell for every Watiq screen. Port of
 * frontend_flask/templates/base.html.
 *
 * The document scaffold, the stylesheet, the preloader, the flash region, the
 * reader controls and THE one navigation bar live here — rendered once, so no
 * screen carries chrome of its own. Footers are still per-shell: the source
 * screens use five distinct footers, and hoisting them would silently change
 * the design.
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

  // The one navigation bar, for every screen. The session decides its shape —
  // anonymous, citizen or officer — and middleware's x-pathname decides which
  // section is current. Pages render content only; none of them carries a
  // nav of its own any more.
  const pathname = requestHeaders.get('x-pathname') ?? '/';
  const { isAuthenticated, isStaff, unreadCount } = await pageContext({ withProfile: false });
  const isAdmin = ['admin', 'director'].includes(await role());

  // Where the reader controls return to when they post without JavaScript.
  // Keeps the query string, so a filtered list comes back still filtered.
  const next =
    pathname ||
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
        <SiteNav
          isAuthenticated={isAuthenticated}
          isAdmin={isAdmin}
          isStaff={isStaff}
          pathname={pathname}
          t={t}
          unreadCount={unreadCount}
        />
        {children}
        {/* The mandated sign-language interpreter slot. Bottom-end corner, so
            it mirrors the reader controls and stays out of the content flow
            on every screen, including the ones with chrome of their own. */}
        <SignLanguageModule t={t} />
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
