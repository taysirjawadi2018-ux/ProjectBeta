
/**
 * The generic error page. Port of the `page` block in
 * frontend_flask/templates/error.html.
 *
 * Only the generic branch renders this — 401/403/429 land on the blocked
 * design and 502/503/504 on the maintenance one (see lib/errors.js). It keeps
 * 404 plain, which is the point: the most common error here is a citizen
 * mistyping a URL, and a dramatic screen for that is noise.
 *
 * No 'use client' and no server-only import, so both the error boundary (which
 * must be a client component) and the server-rendered pages can use it.
 */

import { TSL_MAINTENANCE_VIDEO } from '@/lib/tsl.js';

const ICONS = { 404: 'search_off', 409: 'history' };

export default function ErrorScreen({ code, title, message, reference }) {
  return (
    <section className="max-w-2xl mx-auto text-center py-12 space-y-6">
      {/* Guide row 10: this screen carries the maintenance clip, wherever it
          renders. watiq.js reads the marker and points the interpreter
          panel at it — the panel itself lives in the root layout. */}
      <span data-tsl-clip={TSL_MAINTENANCE_VIDEO} hidden />
      <span aria-hidden="true" className="material-symbols-outlined text-primary text-[64px]">
        {ICONS[code] ?? 'warning'}
      </span>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
      <p className="font-body-lg text-body-lg text-on-surface-variant">{message}</p>
      <p className="font-label-sm text-label-sm text-on-surface-variant">
        Reference: {code}
        {reference ? ` · ${reference}` : ''}
      </p>
      <div className="flex flex-wrap justify-center gap-4 pt-4">
        <a
          className="inline-flex items-center gap-2 bg-primary-container text-on-primary font-label-md text-label-md py-3 px-6 rounded hover:bg-primary transition-colors focus-ring"
          href="/"
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            account_balance
          </span>
          Return to the portal
        </a>
        <a
          className="inline-flex items-center gap-2 border border-outline-variant text-on-surface font-label-md text-label-md py-3 px-6 rounded hover:bg-surface-container-low transition-colors focus-ring"
          href="/help"
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            help
          </span>
          Get help
        </a>
      </div>
    </section>
  );
}
