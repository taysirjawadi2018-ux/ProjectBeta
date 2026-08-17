import 'server-only';
import { getTranslator } from './i18n.js';

/**
 * A translated page title.
 *
 * Next's static `export const metadata` is evaluated once, outside any request,
 * so it cannot see the reader's language — every page title stayed English
 * while the whole body translated. `generateMetadata` runs per request and can.
 *
 * The name and the suffix are looked up SEPARATELY, because that is how the
 * catalogs key them: the Flask templates emitted
 * `{{ title }} {{ _('| Watiq National Portal') }}`, so "| Watiq National
 * Portal" is an entry and "My Requests | Watiq National Portal" is not.
 * Translating the joined string finds nothing and silently falls through to
 * English — which is exactly what it did before this split.
 */
export function pageTitle(name, { suffix = '| Watiq National Portal' } = {}) {
  return async function generateMetadata() {
    const t = await getTranslator();
    // suffix: null means the catalog holds the WHOLE title as one entry, which
    // is how the Flask templates wrote the two screens that carry a strapline
    // rather than a page name.
    return { title: suffix ? `${t(name)} ${t(suffix)}` : t(name) };
  };
}
