import { NextResponse } from 'next/server';

// Next.js inlines the RSC payload and the hydration bootstrap as <script>
// blocks. Under `script-src 'self'` those are refused and the page never
// hydrates, so each response carries a fresh nonce that both the CSP and Next's
// own script tags use. Next reads the nonce off the `x-nonce` request header
// automatically when it renders those tags.
//
// Flask had this problem nowhere — it emitted no inline script at all — which
// is why the nginx CSP could be a single static header. It no longer can: a
// nonce is per-response by definition. See ops/nginx/nginx.conf for how the
// static header was kept for the API and suppressed for this app.
export function middleware(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    "default-src 'none'",
    // 'strict-dynamic' lets the nonced bootstrap load the chunks it needs
    // without naming each one. Browsers that honour it ignore 'self' for
    // script-src; the ones that do not fall back to 'self', which is still
    // correct here because every chunk is same-origin.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');

  const headers = new Headers(request.headers);
  // Both, and both are load-bearing. Next extracts the nonce for its own
  // <script> tags by parsing the CSP off the REQUEST headers — x-nonce alone
  // produces a correct-looking response header and unnonced scripts, which is
  // the blank page this whole file exists to prevent. x-nonce is what our own
  // components read when they need to nonce something by hand.
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  // Next exposes no request path to server components, and the universal nav
  // needs one to mark the current section without waiting for watiq.js.
  headers.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own build output and the vendored assets — those
    // are same-origin static files with no inline script to protect, and
    // running the middleware on them costs a nonce per image request.
    '/((?!_next/static|_next/image|img|fonts|favicon.ico).*)',
  ],
};
