import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { cookies } from 'next/headers';
import fr from '@/i18n/messages/fr.json';
import ar from '@/i18n/messages/ar.json';
import en from '@/i18n/messages/en.json';
import { getTranslator } from '@/lib/i18n.js';
import { parsePo } from '@/tools/po-to-json.mjs';

// --- catalog parity -------------------------------------------------------
//
// The analogue of frontend_flask/tests/test_i18n_catalog.py. It catches the
// failure mode where the language switcher appears to do nothing because the
// catalog never loaded: direction and lang change, every string stays English.

test('the catalogs are non-trivial and disagree with the source language', () => {
  expect(Object.keys(fr).length).toBeGreaterThan(50);
  expect(Object.keys(ar).length).toBeGreaterThan(50);
  for (const value of Object.values(fr)) expect(value).not.toBe('');
  for (const value of Object.values(ar)) expect(value).not.toBe('');
});

test('english falls through to the source string', () => {
  expect(en).toEqual({});
});

test('the two catalogs cover the same strings', () => {
  // They are generated from one .pot, so a difference means one of them was
  // regenerated and the other was not.
  expect(Object.keys(fr).sort()).toEqual(Object.keys(ar).sort());
});

test('most entries actually differ from their key', () => {
  // Some legitimately match — proper nouns, "09:30", "Watiq". A catalog where
  // most entries matched would be one that had never been translated.
  const identical = Object.entries(fr).filter(([k, v]) => k === v).length;
  expect(identical).toBeLessThan(Object.keys(fr).length * 0.2);
});

test('arabic is actually arabic script, not a copy of the french', () => {
  const arabicChars = Object.values(ar)
    .join('')
    .match(/[؀-ۿ]/g);
  expect(arabicChars?.length ?? 0).toBeGreaterThan(1000);
});

// --- the converter --------------------------------------------------------

test('wrapped strings are joined, not truncated at the first fragment', () => {
  // 122 fr entries begin `msgstr ""` and continue on the following lines. A
  // line-based skip on that marker drops all of them while looking correct.
  const catalog = parsePo(`
msgid ""
msgstr ""
"Project-Id-Version: x\\n"

msgid ""
",\\n"
"                without signing in."
msgstr ""
",\\n"
"                sans vous connecter."

msgid "Untranslated"
msgstr ""

msgid "Simple"
msgstr "Simple, traduit"
`);

  expect(catalog).toEqual({
    ',\n                without signing in.': ',\n                sans vous connecter.',
    Simple: 'Simple, traduit',
  });
  // The header entry and the untranslated one are both absent: an empty value
  // renders as a blank on the page, a missing key falls through to English.
  expect(Object.keys(catalog)).not.toContain('Untranslated');
  expect(Object.keys(catalog)).not.toContain('');
});

test('escapes survive the round trip', () => {
  const catalog = parsePo('msgid "a \\"q\\" and a \\\\ and a\\ttab"\nmsgstr "ok"\n');
  expect(Object.keys(catalog)[0]).toBe('a "q" and a \\ and a\ttab');
});

test('the committed json matches what the script produces from the .po', () => {
  // Guards against the catalogs being hand-edited out of sync with the source
  // of truth the translators work in.
  const regenerate = (locale) =>
    parsePo(
      readFileSync(`../frontend_flask/translations/${locale}/LC_MESSAGES/messages.po`, 'utf8'),
    );
  expect(regenerate('fr')).toEqual(fr);
  expect(regenerate('ar')).toEqual(ar);
});

// --- the translator -------------------------------------------------------

test('a translated string comes back in the reader’s language', async () => {
  (await cookies()).set('watiq_lang', 'fr');
  const t = await getTranslator();

  expect(t.locale).toBe('fr');
  expect(t.dir).toBe('ltr');

  const [source, translated] = Object.entries(fr).find(([k, v]) => k !== v);
  expect(t(source)).toBe(translated);
});

test('an unknown string falls through to readable english, not a bare key', async () => {
  (await cookies()).set('watiq_lang', 'fr');
  const t = await getTranslator();
  expect(t('A sentence nobody has translated yet.')).toBe(
    'A sentence nobody has translated yet.',
  );
});

test('english returns the source string unchanged', async () => {
  (await cookies()).set('watiq_lang', 'en');
  const t = await getTranslator();
  const [source] = Object.entries(fr)[0];
  expect(t(source)).toBe(source);
});

test('arabic reports rtl, which is what mirrors the layout', async () => {
  (await cookies()).set('watiq_lang', 'ar');
  const t = await getTranslator();
  expect(t.dir).toBe('rtl');
});

test('named placeholders are filled and %% is a literal percent', async () => {
  (await cookies()).set('watiq_lang', 'en');
  const t = await getTranslator();

  expect(t('Call %(phone)s or email %(email)s.', { phone: '71 000 000', email: 'a@b.tn' })).toBe(
    'Call 71 000 000 or email a@b.tn.',
  );
  expect(t('Current Progress: 68%%')).toBe('Current Progress: 68%');
});

test('an unsupplied placeholder stays visible rather than printing undefined', async () => {
  (await cookies()).set('watiq_lang', 'en');
  const t = await getTranslator();
  expect(t('Call %(phone)s.')).toBe('Call %(phone)s.');
});
