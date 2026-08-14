import 'server-only';
import { readPrefs } from './prefs.js';
import fr from '@/i18n/messages/fr.json';
import ar from '@/i18n/messages/ar.json';

/**
 * gettext semantics, in about thirty lines: look the source string up, return
 * the translation, fall back to the source string.
 *
 * Deliberately NOT next-intl, which the plan called for. next-intl reads a dot
 * in a key as a namespace path, and 152 of these keys are English sentences
 * that end in a full stop — every one of them would resolve to a missing
 * namespace instead of a translation. Its ICU layer also treats an apostrophe
 * as an escape character, and eight keys contain one. Neither of the features
 * that would justify the trouble is needed: the catalogs carry no plurals and
 * no message contexts (checked — 0 msgid_plural, 0 msgctxt in both files).
 *
 * Keying on English source text rather than symbolic ids is what makes a
 * not-yet-marked-up component render readable English instead of a bare key.
 *
 * Server-side only. A client component that needs a string takes it as a prop
 * from the server component that rendered it, which is also what keeps the
 * catalogs out of the browser bundle — they are ~200KB and the reader needs one
 * language, decided on the server.
 */

const CATALOGS = { en: {}, fr, ar };

/**
 * Python's printf-style named interpolation, which is what the catalogs carry:
 * %(name)s from the Flask templates, and %% for a literal percent. Handled in
 * one pass so a translated string containing a percent sign cannot be mangled
 * by a second one.
 */
function interpolate(text, params) {
  return text.replace(/%(?:%|\((\w+)\)s)/g, (match, name) => {
    if (name === undefined) return '%';
    const value = params?.[name];
    // An unsupplied placeholder is left visible rather than printed as
    // "undefined": it is a bug in the caller, and a blank hides it.
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * The translator for this request's locale.
 *
 * `t(source)` returns the translation, or `source` unchanged when the catalog
 * has no entry — which is also what happens for every string in English, whose
 * catalog is empty on purpose.
 */
export async function getTranslator() {
  const { locale, dir } = await readPrefs();
  const catalog = CATALOGS[locale] ?? {};

  const t = (source, params) => interpolate(catalog[source] ?? source, params);
  t.locale = locale;
  t.dir = dir;
  return t;
}

/** Entry counts, for the parity check that the catalogs actually loaded. */
export function catalogSizes() {
  return Object.fromEntries(
    Object.entries(CATALOGS).map(([locale, c]) => [locale, Object.keys(c).length]),
  );
}
