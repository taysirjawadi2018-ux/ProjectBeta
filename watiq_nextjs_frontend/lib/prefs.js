import 'server-only';
import { cookies, headers } from 'next/headers';

/**
 * Reader preferences. Port of frontend_flask/app.py:215-258.
 *
 * These come from cookies rather than localStorage because the CSP forbids the
 * inline <head> script that would otherwise apply them before first paint. The
 * server already knows, so it renders the classes onto <html> and nothing
 * flashes.
 */

export const THEME_COOKIE = 'watiq_theme';
export const TEXT_SCALE_COOKIE = 'watiq_text_scale';
export const LANG_COOKIE = 'watiq_lang';

export const THEMES = ['light', 'dark'];
export const TEXT_SCALES = [100, 125, 150];

/** A year. The preference has to survive signing out, and it is not a secret. */
export const PREF_MAX_AGE = 31536000;

// Order is the order the switcher renders. English is the source language the
// catalogs are keyed on, so it is also the fallback when a message is missing.
export const LANGUAGES = {
  en: { label: 'English', native: 'English', dir: 'ltr' },
  fr: { label: 'French', native: 'Français', dir: 'ltr' },
  ar: { label: 'Arabic', native: 'العربية', dir: 'rtl' },
};

/**
 * Accept-Language is only consulted when no choice has been made, so an
 * explicit pick always wins over a browser advertising something else.
 *
 * q-values are honoured rather than taking the first supported tag in document
 * order. `fr;q=0.2, ar;q=0.9` means the reader would rather have Arabic, and
 * reading left to right would hand them French.
 */
export function negotiate(header) {
  const ranked = String(header || '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='));
      return {
        tag: tag.trim().slice(0, 2).toLowerCase(),
        q: q ? Number.parseFloat(q.slice(2)) : 1,
      };
    })
    .filter((entry) => Object.hasOwn(LANGUAGES, entry.tag) && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  return ranked[0]?.tag ?? 'en';
}

export async function readPrefs() {
  const jar = await cookies();

  const chosen = jar.get(LANG_COOKIE)?.value ?? '';
  const locale = Object.hasOwn(LANGUAGES, chosen)
    ? chosen
    : negotiate((await headers()).get('accept-language'));

  // Anyone can hand these cookies any value, and they are rendered straight
  // into a class attribute, so an unrecognised one is discarded rather than
  // escaped: the set of legal values is small and closed.
  const rawTheme = jar.get(THEME_COOKIE)?.value ?? '';
  const theme = THEMES.includes(rawTheme) ? rawTheme : 'light';

  const rawScale = Number.parseInt(jar.get(TEXT_SCALE_COOKIE)?.value ?? '', 10);
  const textScale = TEXT_SCALES.includes(rawScale) ? rawScale : 100;

  return {
    locale,
    dir: LANGUAGES[locale].dir,
    theme,
    textScale,
    themeClass: theme === 'dark' ? 'dark' : '',
    textScaleClass: textScale === 100 ? '' : `text-scale-${textScale}`,
  };
}
