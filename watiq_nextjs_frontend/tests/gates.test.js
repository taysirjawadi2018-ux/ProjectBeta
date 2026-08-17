import { describe, expect, test } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import path from 'node:path';

/**
 * Regression gate: no dead links, no orphan buttons, no CSP violations.
 * Port of frontend_flask/tests/test_no_dead_controls.py and
 * test_markup_balance.py.
 *
 * These are the three ways the ported mockups quietly stopped being a working
 * application, so each is asserted rather than eyeballed. The JSX form of the
 * check is stricter than the Jinja one in one respect and looser in another:
 * JSX cannot produce unbalanced markup (the compiler refuses it), so the
 * balance test is gone, but React's `dangerouslySetInnerHTML` is a new way to
 * reintroduce everything the CSP forbids, so that is checked instead.
 */

const ROOT = path.resolve(__dirname, '..');

const SOURCES = [
  ...globSync('app/**/*.jsx', { cwd: ROOT }),
  ...globSync('components/**/*.jsx', { cwd: ROOT }),
].sort();

test('the source list is not empty, or every test below passes vacuously', () => {
  expect(SOURCES.length).toBeGreaterThan(30);
});

/** Strip block and line comments — they are where these constructs get described. */
function code(file) {
  return readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

describe.each(SOURCES)('%s', (file) => {
  test('no placeholder links', () => {
    const hits = code(file).match(/href="#"/g) ?? [];
    expect(hits, `${file} still has ${hits.length} href="#"`).toHaveLength(0);
  });

  test('every button does something', () => {
    // A button either submits a form, carries an onClick, or has a
    // data-action hook for the progressive-enhancement script.
    const orphans = [...code(file).matchAll(/<button\b([\s\S]*?)>/g)]
      .filter(
        (m) =>
          !/type=["{]?["']?submit/.test(m[1]) &&
          !/onClick/.test(m[1]) &&
          !/data-action/.test(m[1]),
      )
      .map((m) => m[0].slice(0, 100));
    expect(orphans, `${file}: buttons with no behaviour`).toHaveLength(0);
  });

  test('no CSP-violating constructs', () => {
    // The production CSP is default-src 'none' with script-src/style-src
    // 'self' plus a per-request nonce. Inline styles, inline handlers and any
    // remote asset host are all rejected by it.
    const src = code(file);

    expect(src, `${file}: inline <style> is blocked by style-src`).not.toMatch(/<style[\s>]/);
    expect(src, `${file}: inline style attribute is blocked`).not.toMatch(/\sstyle="/);
    // React's style={{…}} compiles to a style attribute, which the CSP refuses
    // just the same. The design tokens exist so there is no need for one.
    expect(src, `${file}: style={{…}} compiles to a blocked style attribute`).not.toMatch(
      /\sstyle=\{\{/,
    );
    expect(
      src,
      `${file}: dangerouslySetInnerHTML reintroduces everything the CSP forbids`,
    ).not.toMatch(/dangerouslySetInnerHTML/);

    for (const host of [
      'cdn.tailwindcss.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com',
      'lh3.googleusercontent.com',
    ]) {
      expect(src, `${file}: ${host} is refused by default-src 'none'`).not.toContain(host);
    }
  });

  test('no absolute asset URLs', () => {
    // Every asset is same-origin. An https:// src or href to anything but the
    // portal is refused by the CSP, so it renders as a broken image with
    // nothing in the server log.
    const remote = [...code(file).matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(remote, `${file}: remote assets`).toHaveLength(0);
  });
});

describe('the vendored enhancement script', () => {
  const script = readFileSync(path.join(ROOT, 'public/js/watiq.js'), 'utf8');

  test('posts preferences to the route that exists', () => {
    // The Flask route was /preferences; under Next it is /api/preferences. A
    // stale path here fails silently — the form still submits natively, so the
    // control works and the enhancement simply never engages.
    expect(script).not.toMatch(/["']\/preferences["']/);
  });
});
