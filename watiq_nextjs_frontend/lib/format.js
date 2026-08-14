/**
 * Shape normalisers shared by every screen. Port of api.py:203-226 plus the
 * name resolution the templates did inline.
 *
 * No 'server-only' here on purpose: these are pure functions over data that has
 * already crossed the boundary, and a client component may need them too.
 */

// The two /me endpoints disagree: GET /auth/me returns first_name/last_name,
// GET /staff/me returns a single `name` column (see
// backend/app/modules/staff/repository.py _GET_ME). Components that greet the
// signed-in person render for both, so resolve it once here.
export function displayName(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const name = String(profile.name || '').trim();
  if (name) return name;
  return [profile.first_name, profile.last_name]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Normalise a collection response to a list.
 *
 * The API returns bare lists from some endpoints (catalog/services,
 * appointments/office) and `{items, total}` envelopes from the paginated ones.
 * A component that iterates the wrong shape does not fail loudly — it iterates
 * an object's keys and then blows up on the first property access, producing a
 * 500 on a page that merely had no data.
 */
export function itemsOf(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return Array.isArray(data.items) ? data.items : [];
  return [];
}

export function totalOf(data, fallback = 0) {
  if (data && typeof data === 'object' && !Array.isArray(data) && Number.isInteger(data.total)) {
    return data.total;
  }
  if (Array.isArray(data)) return data.length;
  return fallback;
}
