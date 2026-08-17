/**
 * Presentation helpers shared by the screens.
 *
 * No 'server-only': these are pure functions over data that has already crossed
 * the boundary, and the client components need some of them too.
 */

/** ISO date/datetime → the readable form the mockups use. Never throws. */
export function formatDate(value, { withTime = false } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const opts = { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
  // 'en-GB' rather than the reader's locale: these are record dates quoted at a
  // counter, and a format that reorders day and month between languages makes
  // "05/08" ambiguous in exactly the case where it matters.
  return new Intl.DateTimeFormat('en-GB', opts).format(date);
}

export function formatMoney(amount, currency = 'TND') {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  // Three decimals: the dinar is a millime currency, and rounding to two loses
  // a real unit of money.
  return `${value.toFixed(3)} ${currency}`;
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * Status → the token pair the design uses.
 *
 * Matched on the lowercased name because the API sends display names
 * ("Under review") on requests and codes ("verified") on documents, and the
 * screens render both.
 */
const STATUS_TONES = [
  [/(approved|completed|verified|issued|ready|active|booked|paid)/, 'bg-secondary-container text-on-secondary-container border-secondary'],
  [/(rejected|failed|cancelled|canceled|no_show|expired|blocked|inactive)/, 'bg-error-container text-on-error-container border-error'],
  [/(pending|review|processing|submitted|awaiting|payment)/, 'bg-tertiary-container text-on-tertiary-container border-tertiary'],
];

export function statusTone(status) {
  const text = String(status ?? '').toLowerCase();
  for (const [pattern, classes] of STATUS_TONES) {
    if (pattern.test(text)) return classes;
  }
  return 'bg-surface-container-high text-on-surface-variant border-outline-variant';
}

/** A status name fit to display, whatever shape the API sent. */
export function statusLabel(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Unknown';
  return text.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Page numbers for a total/size pair.
 *
 * Returns null when there is only one page, so a caller can skip rendering the
 * control entirely rather than drawing a disabled one.
 */
export function pagination({ total = 0, page = 1, size = 20 }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return {
    page,
    pages,
    hasPrev: page > 1,
    hasNext: page < pages,
    prev: Math.max(1, page - 1),
    next: Math.min(pages, page + 1),
  };
}

/** Build a query string from an object, dropping empties. */
export function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)));
    else search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** searchParams values arrive as string | string[] | undefined. */
export function one(value, fallback = '') {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export function many(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === '' ? [] : [value];
}

export function intOr(value, fallback) {
  const parsed = Number.parseInt(one(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
