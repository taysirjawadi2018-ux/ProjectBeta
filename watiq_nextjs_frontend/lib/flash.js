import 'server-only';
import { getSession, setSession } from './session.js';

/**
 * One-shot messages, the analogue of Flask's flash()/get_flashed_messages().
 *
 * IMPORTANT: flash() writes the session, and writing the session may need to
 * issue the cookie, which Next only permits inside a Server Action or a Route
 * Handler. Calling it while rendering a Server Component throws. That is why
 * the route guards use a NOTICE code in the redirect URL instead — see
 * lib/guards.js.
 *
 * Categories match the Flask templates: 'info', 'success', 'error', 'warning'.
 */

export async function flash(message, category = 'info') {
  const session = await getSession();
  const queue = Array.isArray(session.flash) ? session.flash : [];
  await setSession({ flash: [...queue, { message: String(message), category }] });
}

/** Read and clear. Rendering a message twice is worse than not showing it. */
export async function takeFlashes() {
  const session = await getSession();
  const queue = Array.isArray(session.flash) ? session.flash : [];
  if (queue.length) await setSession({ flash: [] });
  return queue;
}

/**
 * Redirect-carried notices.
 *
 * A guard cannot write a flash (see above), and it cannot put free text in the
 * URL either — that is a reflected-text injection waiting to happen, and it
 * would be untranslatable. So it passes one of these fixed codes as ?notice=
 * and the receiving page looks the message up here.
 */
export const NOTICES = {
  signin_required: { message: 'Please sign in to continue.', category: 'info' },
  session_expired: { message: 'Your session has expired. Please sign in again.', category: 'info' },
  signed_out: { message: 'You have been signed out.', category: 'success' },
};

/** Unknown codes render nothing, so a hand-edited URL cannot inject a message. */
export function noticeFor(code) {
  return NOTICES[String(code || '')] ?? null;
}
