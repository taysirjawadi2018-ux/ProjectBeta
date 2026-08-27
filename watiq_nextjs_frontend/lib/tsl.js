/**
 * Which Tunisian Sign Language clip belongs on which screen.
 *
 * The interpreter panel (components/SignLanguageModule.jsx) renders once from
 * the root layout and floats over every route, so the clip it shows has to be
 * chosen per request from the pathname. This module is that choice, kept out
 * of the layout so the mapping is one readable table rather than a branch in
 * the middle of the shell.
 *
 * The pairing is sign_language_videos_guide.pdf, which scripts ten clips
 * against ten screens and names the target file for each. Its "Target File /
 * Page" column is reproduced verbatim in the comments below, so a row here can
 * be checked against the guide without opening it. Filenames are the ones the
 * clips were delivered under and are deliberately left untouched, so a clip on
 * disk traces back to its row in the guide.
 *
 * Nine of the ten rows name a route. The tenth names two components —
 * BlockedScreen.jsx and ErrorScreen.jsx — because an error or maintenance view
 * can replace the content of *any* route (lib/errors.js renders one whenever an
 * upstream call fails), so its clip has to follow the screen rather than the
 * path. That one is TSL_MAINTENANCE_VIDEO below, applied by those components.
 */

const BASE = '/video/tsl';

// Patterns are matched longest-first, so `/login/mfa` beats `/login` whatever
// order they are written in. A `:param` segment matches exactly one segment,
// which is how the dynamic request id in row 5 is covered. `/` is exact-match
// only — as a prefix it would swallow every other route.
const ROUTES = [
  // 1. Homepage & Portal Overview → app/page.jsx (Main Landing Page)
  ['/', 'IntroToWebsite.mp4'],
  // 2. Public Service Catalogue → app/services/page.jsx
  ['/services', 'DocumentsSearch.mp4'],
  // 3. Request Tracking → app/track/page.jsx
  ['/track', 'TrackRequest.mp4'],
  // 4. Appointment Booking → app/appointments/book/page.jsx
  ['/appointments/book', 'BookOfficeVisit.mp4'],
  // 5. New Request & Document Upload → app/requests/new/page.jsx &
  //    UploadForm.jsx, which is the upload step at the route below.
  ['/requests/new', 'FillInDetails.mp4'],
  ['/requests/:id/documents/new', 'FillInDetails.mp4'],
  // 6. Citizen Sign-In → app/login/page.jsx
  ['/login', 'SignIn.mp4'],
  // 7. Multi-Factor Authentication → app/login/mfa/page.jsx
  ['/login/mfa', '2FA.mp4'],
  // 8. Support & Live Interpreter Assistance → app/support/chat/page.jsx.
  //    The guide scopes this to the live desk, not the /help knowledge base.
  ['/support/chat', 'NeedHelp.mp4'],
  // 9. Accessibility & Privacy → app/accessibility/page.jsx &
  //    app/legal/privacy/page.jsx
  ['/accessibility', 'WhyVhooseWatiq.mp4'],
  ['/legal/privacy', 'WhyVhooseWatiq.mp4'],
  // 10, for the one error screen that owns a route of its own. The marker in
  // BlockedScreen.jsx covers it too, but resolving it here means /blocked is
  // server-rendered with its clip and needs no JavaScript to show it.
  ['/blocked', 'SignInAgain.mp4'],
];

// 10. System Alerts & Maintenance → components/BlockedScreen.jsx &
//     components/ErrorScreen.jsx (Error & Maintenance Modal/Views).
export const TSL_MAINTENANCE_VIDEO = `${BASE}/SignInAgain.mp4`;

// Compiled once at module load rather than per request. Sorting by segment
// count then by length keeps the more specific pattern ahead of its parent.
const PATTERNS = ROUTES.filter(([route]) => route !== '/')
  .map(([route, file]) => ({ segments: route.split('/').filter(Boolean), file }))
  .sort((a, b) => b.segments.length - a.segments.length);

const HOME = ROUTES.find(([route]) => route === '/')[1];

/**
 * The clip for a pathname, as a public URL, or '' when the screen has none.
 *
 * Matching is per segment, so `/services` covers `/services/passport` but never
 * `/services-admin`. Trailing slashes are tolerated.
 */
export function tslVideoFor(pathname) {
  if (!pathname) return '';

  const path = pathname.split('?')[0];
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return `${BASE}/${HOME}`;

  const hit = PATTERNS.find(
    ({ segments: pattern }) =>
      pattern.length <= segments.length &&
      pattern.every(
        (seg, i) => seg.startsWith(':') || seg === segments[i],
      ),
  );
  return hit ? `${BASE}/${hit.file}` : '';
}
