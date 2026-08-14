import 'server-only';
import { ApiError } from './api.js';
import { clearSession } from './session.js';
import { TITLES, UNREACHABLE_VIEW, designFor } from './error-views.js';

/**
 * The server half of the error mapping. Port of
 * frontend_flask/app.py:275-365.
 *
 * The constants live in ./error-views.js because app/error.js is a client
 * component and cannot import a server-only module; everything there is
 * re-exported below so server callers need only this import.
 */

export * from './error-views.js';

/**
 * Turn a thrown error into what the screen needs.
 *
 * Statuses outside the set the BFF renders collapse to 502, matching Flask: a
 * 500 from the API is a fault in the records service as far as a citizen is
 * concerned, and surfacing the upstream number invites them to report the wrong
 * thing.
 *
 * Clears the session on 401 — those tokens are known-dead, and leaving them
 * means every subsequent page repeats the same failed refresh.
 */
export async function errorViewFor(err) {
  // No status at all means the API was unreachable rather than unhappy.
  if (!(err instanceof ApiError)) return { ...UNREACHABLE_VIEW };

  if (err.status === 401) await clearSession();

  const code = [401, 403, 404, 409, 429].includes(err.status) ? err.status : 502;
  return {
    code,
    title: TITLES[code] ?? 'Something went wrong',
    message: err.userMessage(),
    design: designFor(code),
  };
}
