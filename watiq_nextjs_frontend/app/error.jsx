'use client';

import ErrorScreen from '@/components/ErrorScreen.jsx';
import { SERVER_ERROR_VIEW } from '@/lib/error-views.js';

/**
 * The last-resort boundary, for a throw no page handled itself.
 *
 * It deliberately says nothing about the cause. In production Next replaces a
 * server error's message with an opaque `digest` before it reaches the client,
 * so there is nothing specific to show even if we wanted to — which is why the
 * pages catch ApiError themselves and render the right screen through
 * lib/errors.js rather than letting it fall through to here. Anything that
 * lands here is a bug, not an expected failure.
 *
 * `digest` is the one thing worth surfacing: it is the key that ties this
 * screen to the stack trace in the server log.
 */
export default function GlobalError({ error, reset }) {
  return (
    <>
      <ErrorScreen {...SERVER_ERROR_VIEW} reference={error?.digest} />
      <div className="flex justify-center pb-12">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 border border-outline-variant text-on-surface font-label-md text-label-md py-3 px-6 rounded hover:bg-surface-container-low transition-colors focus-ring"
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            refresh
          </span>
          Try again
        </button>
      </div>
    </>
  );
}
