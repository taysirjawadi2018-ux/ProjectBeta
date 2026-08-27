/**
 * Which Tunisian Sign Language clip belongs on which screen.
 *
 * The interpreter panel (components/SignLanguageModule.jsx) renders once from
 * the root layout and floats over every route, so the clip it shows has to be
 * chosen per request from the pathname. This module is that choice, kept out
 * of the layout so the mapping is one readable table rather than a branch in
 * the middle of the shell.
 *
 * The pairing comes from sign_language_videos_guide.pdf, which scripts ten
 * clips against ten screens. Filenames are the ones the clips were delivered
 * under; they are deliberately left untouched so a clip on disk can be traced
 * back to its row in that guide.
 *
 * Routes are matched longest-prefix-first, so `/login/mfa` wins over `/login`
 * regardless of the order entries are written in. A screen with no entry gets
 * no clip, and the panel falls back to its "coming soon" placeholder.
 */

const BASE = '/video/tsl';

// Longest-prefix-first, so nested routes beat their parents. `/` is special:
// it is an exact match only, otherwise it would swallow every other route.
const ROUTES = [
  // "Homepage & Portal Overview" — welcome, and what the portal is for.
  ['/', 'IntroToWebsite.mp4'],
  // "Public Service Catalogue" — searching services, required documents, fees.
  ['/services', 'DocumentsSearch.mp4'],
  // "Request Tracking" — entering a receipt code to read application status.
  ['/track', 'TrackRequest.mp4'],
  // "Appointment Booking" — choosing office, date and time slot.
  ['/appointments/book', 'BookOfficeVisit.mp4'],
  // "New Request & Document Upload" — filling details, uploading copies.
  ['/requests/new', 'FillInDetails.mp4'],
  // "Multi-Factor Authentication" — the 6-digit code screen. Listed before
  // /login only for readability; the longest-prefix sort is what enforces it.
  ['/login/mfa', '2FA.mp4'],
  // "Citizen Sign In" — National ID and password, or biometric sign-in.
  ['/login', 'SignIn.mp4'],
  // "Support & Live Interpreter Assistance" — starting a live interpreter call.
  ['/support/chat', 'NeedHelp.mp4'],
  ['/help', 'NeedHelp.mp4'],
  // "Accessibility & Privacy" — the accessibility guarantees and data policy.
  ['/accessibility', 'WhyVhooseWatiq.mp4'],
  ['/legal/privacy', 'WhyVhooseWatiq.mp4'],
  // "System Alerts & Maintenance" — session expired, come back shortly. This
  // covers the forbidden screen; app/error.jsx and app/not-found.jsx render
  // under whatever path was requested, so they keep that path's clip.
  ['/blocked', 'SignInAgain.mp4'],
];

// Sorted once at module load rather than per request.
const PREFIXES = ROUTES.filter(([route]) => route !== '/').sort(
  (a, b) => b[0].length - a[0].length,
);

const HOME = ROUTES.find(([route]) => route === '/')[1];

/**
 * The clip for a pathname, as a public URL, or '' when the screen has none.
 *
 * Trailing slashes are tolerated. Matching is on path segments, so `/services`
 * matches `/services` and `/services/passport` but never `/services-admin`.
 */
export function tslVideoFor(pathname) {
  if (!pathname) return '';

  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '' || path === '/') return `${BASE}/${HOME}`;

  const hit = PREFIXES.find(
    ([route]) => path === route || path.startsWith(`${route}/`),
  );
  return hit ? `${BASE}/${hit[1]}` : '';
}
