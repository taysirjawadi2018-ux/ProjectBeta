import { expect, test } from 'vitest';
import { cookies } from 'next/headers';
import { render } from './render.js';
import RootLayout from '@/app/layout.jsx';
import A11yControls from '@/components/A11yControls.jsx';
import Flash from '@/components/Flash.jsx';
import SiteNav from '@/components/SiteNav.jsx';
import { setSession } from '@/lib/session.js';
import { flash } from '@/lib/flash.js';
import { resetRequestScope } from './mocks/next-headers.js';

// --- the document shell ---------------------------------------------------

test('arabic renders rtl with the locale on <html>', async () => {
  (await cookies()).set('watiq_lang', 'ar');
  const html = await render(RootLayout, { children: null });
  expect(html).toContain('dir="rtl"');
  expect(html).toContain('lang="ar"');
});

test('the text-scale class reaches <html>', async () => {
  (await cookies()).set('watiq_text_scale', '125');
  const html = await render(RootLayout, { children: null });
  expect(html).toContain('text-scale-125');
});

test('the dark class reaches <html>, and light is kept alongside it', async () => {
  (await cookies()).set('watiq_theme', 'dark');
  const html = await render(RootLayout, { children: null });
  // `light` is inert — only .dark is wired to darkMode: 'class' — but several
  // checks look for one of tk-/light/dark on this element.
  expect(html).toMatch(/class="light dark"/);
});

test('the default shell carries neither a theme nor a scale class', async () => {
  const html = await render(RootLayout, { children: null });
  expect(html).toMatch(/class="light"/);
  expect(html).toContain('dir="ltr"');
  expect(html).toContain('lang="en"');
});

test('no external origin is referenced', async () => {
  const html = await render(RootLayout, { children: null });
  // The CSP is default-src 'none' with no remote origin allowed, so anything
  // absolute here is a resource the browser will refuse to load.
  expect(html).not.toMatch(/https?:\/\/(?!localhost)/);
});

test('the enhancement script is nonced, or strict-dynamic refuses it', async () => {
  resetRequestScope({ headers: { 'x-nonce': 'TESTNONCE' } });
  const html = await render(RootLayout, { children: null });
  expect(html).toContain('src="/js/watiq.js"');
  expect(html).toContain('nonce="TESTNONCE"');
});

test('the reader controls come after the page content, for tab order', async () => {
  const html = await render(RootLayout, { children: null });
  const controls = html.indexOf('data-a11y-controls');
  const preloader = html.indexOf('watiq-preloader');
  expect(controls).toBeGreaterThan(-1);
  // Chrome must not sit between the skip target and the page's own content.
  expect(controls).toBeGreaterThan(preloader);
});

test('the layout renders exactly one nav — the universal one — and no footer', async () => {
  const html = await render(RootLayout, { children: null });
  // One bar for every screen: anonymous, citizen and officer all read the
  // same component. Footers stay per-shell by design.
  expect((html.match(/<nav\b/g) ?? []).length).toBe(1);
  expect(html).not.toContain('<footer');
});

// --- reader controls ------------------------------------------------------

test('the controls post a real form, so they work without javascript', async () => {
  const html = await render(A11yControls, { locale: 'fr', theme: 'light', textScale: 100 });
  expect(html).toContain('action="/api/preferences"');
  expect(html).toContain('method="post"');
});

test('the current choice is announced through aria-pressed', async () => {
  const html = await render(A11yControls, { locale: 'ar', theme: 'dark', textScale: 150 });

  expect(html).toMatch(/lang="ar"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*lang="ar"/);
  expect(html).toMatch(/value="150"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*value="150"/);
  // The theme button submits the OPPOSITE value: it is what you get by pressing.
  expect(html).toContain('value="light"');
});

test('every language is offered, each labelled in its own script', async () => {
  const html = await render(A11yControls, { locale: 'en', theme: 'light', textScale: 100 });
  expect(html).toContain('value="en"');
  expect(html).toContain('value="fr"');
  expect(html).toContain('value="ar"');
  // Someone hunting for Arabic looks for العربية, not for the word "Arabic".
  expect(html).toContain('العربية');
});

test('the controls carry where to return to', async () => {
  const html = await render(A11yControls, {
    locale: 'en',
    theme: 'light',
    textScale: 100,
    next: '/requests?status_id=2',
  });
  expect(html).toContain('value="/requests?status_id=2"');
});

// --- flash ----------------------------------------------------------------

test('an error interrupts the screen reader and everything else waits', async () => {
  const html = await render(Flash, {
    messages: [
      { message: 'Broken.', category: 'error' },
      { message: 'Saved.', category: 'success' },
    ],
  });
  expect(html).toContain('role="alert"');
  expect(html).toContain('role="status"');
  expect(html).toContain('Broken.');
  expect(html).toContain('Saved.');
});

test('no messages renders nothing at all, not an empty live region', async () => {
  expect(await render(Flash, { messages: [] })).toBe('');
});

test('the layout drains the queue, so a reload does not repeat the message', async () => {
  await setSession({ access_token: 'tok' });
  await flash('Saved.', 'success');

  expect(await render(RootLayout, { children: null })).toContain('Saved.');
  expect(await render(RootLayout, { children: null })).not.toContain('Saved.');
});

// --- shared nav -----------------------------------------------------------

test('signed out shows sign-in and no sign-out', async () => {
  const html = await render(SiteNav, { isAuthenticated: false });
  expect(html).toContain('href="/login"');
  expect(html).not.toContain('logout');
});

test('a citizen gets the profile link and a staff member the workbench', async () => {
  expect(await render(SiteNav, { isAuthenticated: true, isStaff: false })).toContain('href="/profile"');
  expect(await render(SiteNav, { isAuthenticated: true, isStaff: true })).toContain('href="/staff"');
});

test('the unread badge renders only when there is something unread', async () => {
  const withCount = await render(SiteNav, { isAuthenticated: true, unreadCount: 3 });
  expect(withCount).toContain('(3 unread)');
  expect(withCount).toMatch(/>3</);

  // Reading `count` instead of `unread_count` made this permanently 0, which
  // renders as no badge at all — a silent failure with no error anywhere.
  const withoutCount = await render(SiteNav, { isAuthenticated: true, unreadCount: 0 });
  expect(withoutCount).not.toContain('unread)');
});

test('the active item is the only one marked current', async () => {
  const html = await render(SiteNav, { pathname: '/requests' });
  expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
});

test('a nested route still marks its section, and only that section', async () => {
  const html = await render(SiteNav, { pathname: '/requests/11/documents/3' });
  const marked = html.match(/aria-current="page"[^>]*href="([^"]*)"|href="([^"]*)"[^>]*aria-current="page"/g) ?? [];
  expect(marked).toHaveLength(1);
  expect(html).toContain('href="/requests"');
});

test('an officer gets the back-office sections in the same bar', async () => {
  const html = await render(SiteNav, { isAuthenticated: true, isStaff: true });
  expect(html).toContain('href="/staff/review"');
  expect(html).toContain('href="/staff/audit"');
  // The citizen sections mean nothing inside the workbench.
  expect(html).not.toContain('href="/payments"');
});
