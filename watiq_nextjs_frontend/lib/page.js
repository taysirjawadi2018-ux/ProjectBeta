import 'server-only';
import { getTranslator } from './i18n.js';
import { isAuthenticated, isStaff, currentProfile } from './auth.js';
import { tryGet } from './api.js';

/**
 * The per-request context nearly every screen needs, in one call.
 *
 * Flask assembled this in a context processor that ran for every render; the
 * Next equivalent is each page asking for it, so a page that does not need the
 * unread count does not pay for the request.
 *
 * `unreadCount` reads `unread_count`, NOT `count`. Reading the wrong key made
 * the badge permanently 0, which renders as no badge — a silent failure with
 * nothing in any log.
 */
export async function pageContext({ withUnread = true, withProfile = true } = {}) {
  const t = await getTranslator();
  const authed = await isAuthenticated();
  const staff = await isStaff();

  // Fetched fresh and never cached — this is PII, and none of it is written to
  // Redis (Backend.md §7, ADR-003).
  const profile = withProfile && authed ? await currentProfile() : null;

  let unreadCount = null;
  if (withUnread && authed && !staff) {
    const data = await tryGet('/api/v1/notifications/unread-count', null);
    if (data && typeof data === 'object') {
      unreadCount = Number(data.unread_count ?? data.count ?? 0) || 0;
    } else if (typeof data === 'number') {
      unreadCount = data;
    }
  }

  return { t, isAuthenticated: authed, isStaff: staff, profile, unreadCount };
}
