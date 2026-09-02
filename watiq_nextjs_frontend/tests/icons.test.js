import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { render } from './render.js';
import { setSession } from '@/lib/session.js';

/**
 * Every Material Symbols ligature the portal renders is in the subsetted font.
 *
 * public/fonts/material-symbols-outlined.woff2 carries only the ligatures named
 * in tools/icons.txt, and a name that is not in it does not fail — the browser
 * paints the name itself, one 1em glyph per character, out of whatever box it
 * was in. `cloud_done` on the landing page was rendering as the word
 * CLOUD_DONE at 24px, and `folder_open` as FOLDER_OPEN at 48px.
 *
 * That happened because the subsetter (tools/design/vendor_assets.py) could
 * only see a ligature written literally between `>` and `<`, and most of the
 * icons here are supplied dynamically — from a tuple table, an `icon` prop, a
 * status map, a ternary, or public/js swapping textContent on click. This test
 * closes that loop from the other end: it reads the names off RENDERED output,
 * where every one of those spellings has already resolved to the string the
 * browser will try to look up.
 *
 * A failure here means someone added an icon; re-run `npm run vendor` to
 * regenerate icons.txt and the woff2, and commit both.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const LISTED = new Set(
  readFileSync(path.join(ROOT, 'tools/icons.txt'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean),
);

// The class is always present on the element that carries the ligature, so one
// pattern covers <span>, <a> and anything else the screens use as an icon.
const RENDERED = /class="[^"]*material-symbols-outlined[^"]*"[^>]*>\s*([a-z][a-z0-9_]*)\s*</g;

function iconsIn(html) {
  return [...html.matchAll(RENDERED)].map((m) => m[1]);
}

// Next hands a page both of these as promises. The ids are the ones the
// fixtures answer to, so detail pages render rather than throwing notFound.
const props = {
  searchParams: Promise.resolve({}),
  params: Promise.resolve({ id: '11', documentId: '5' }),
};

const pages = import.meta.glob('../app/**/page.jsx', { eager: true });

async function collectFromPages() {
  const names = new Set();
  for (const [file, mod] of Object.entries(pages)) {
    const Page = mod.default;
    if (typeof Page !== 'function') continue;
    let html;
    try {
      html = await render(Page, props);
    } catch {
      // Guards redirect and detail pages notFound under a session they do not
      // match. Both are covered by routes.test.js; here they simply contribute
      // no icons, and the same screens are reached under the other role below.
      continue;
    }
    for (const name of iconsIn(html)) names.add(name);
    void file;
  }
  return names;
}

// Icons that no fixture can render. An EmptyState's icon only appears when a
// panel comes back empty, an ErrorScreen's only on the matching status, and the
// ones public/js swaps in (`swapIcon(trigger, "pause")`, `icon.textContent =
// "content_copy"`) never exist in server output at all. Those are read
// straight out of the source instead, so a branch nobody rendered still counts.
const SOURCES = import.meta.glob('../{app,components}/**/*.jsx', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const SCRIPTS = import.meta.glob('../public/js/**/*.js', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// (?<![-\w]) so data-a11y-icon="dark" — an SVG marker, not a ligature — is
// not read as an icon name.
const ICON_PROP = /(?<![-\w])icon\s*[:=]\s*\{?\s*['"]([a-z][a-z0-9_]*)['"]/g;
const JS_SWAP = /swapIcon\s*\([^,]+,\s*([^)]*)\)/g;
const JS_TEXT = /\w*[Ii]con\w*\s*\.textContent\s*=\s*([^;]*)/g;
const STRING = /['"]([a-z][a-z0-9_]{1,40})['"]/g;

function declaredIcons() {
  const names = new Set();
  for (const text of Object.values(SOURCES)) {
    for (const [, name] of text.matchAll(ICON_PROP)) names.add(name);
  }
  for (const text of Object.values(SCRIPTS)) {
    for (const re of [JS_SWAP, JS_TEXT]) {
      for (const [, expr] of text.matchAll(re)) {
        for (const [, name] of expr.matchAll(STRING)) names.add(name);
      }
    }
  }
  return names;
}

describe('every rendered icon is in the subsetted font', () => {
  test('tools/icons.txt is the list the font was built from', () => {
    expect(LISTED.size).toBeGreaterThan(50);
  });

  test('including the ones only a prop or a click supplies', () => {
    const declared = [...declaredIcons()];
    expect(declared.length).toBeGreaterThan(10);
    const missing = declared.filter((name) => !LISTED.has(name)).sort();
    expect(missing, `not in tools/icons.txt — run \`npm run vendor\`: ${missing.join(', ')}`)
      .toEqual([]);
  });

  test('across every page, signed out, as a citizen and as an admin', async () => {
    const seen = new Set();

    for (const name of await collectFromPages()) seen.add(name);

    await setSession({ access_token: 'citizen-token', is_staff: false, role: 'citizen' });
    for (const name of await collectFromPages()) seen.add(name);

    await setSession({ access_token: 'staff-token', is_staff: true, role: 'admin' });
    for (const name of await collectFromPages()) seen.add(name);

    // The scan is only as good as its reach; if it stops finding icons at all
    // the assertion below would pass vacuously.
    expect(seen.size).toBeGreaterThan(20);

    const missing = [...seen].filter((name) => !LISTED.has(name)).sort();
    expect(missing, `not in tools/icons.txt — run \`npm run vendor\`: ${missing.join(', ')}`)
      .toEqual([]);
  });
});
