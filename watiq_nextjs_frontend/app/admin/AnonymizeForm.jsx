'use client';

import { useState } from 'react';
import { anonymizeUserAction } from '@/lib/actions.js';

/**
 * Irreversible erasure (GDPR Art. 17).
 *
 * Behind a <details> so it cannot be hit by a mis-click next to Deactivate, and
 * behind two guards the action re-checks on the server: the operator types the
 * national ID, and confirms stored documents were purged FIRST.
 *
 * That order matters and is not arbitrary — fn_anonymize_user() severs the link
 * between the person and their blobs, so anything still in object storage
 * afterwards is orphaned and can no longer be found for deletion.
 *
 * The client-side disable is a courtesy. The action validates both guards
 * again, because a form is whatever the browser chooses to send.
 */
export default function AnonymizeForm({ userId, nationalId }) {
  const [typed, setTyped] = useState('');
  const [purged, setPurged] = useState(false);

  const ready = typed.trim() === String(nationalId ?? '').trim() && purged;

  return (
    <details className="border border-error/40 rounded-lg">
      <summary className="cursor-pointer list-none px-3 py-2 font-label-sm text-label-sm text-error focus-ring rounded">
        Erase permanently…
      </summary>

      <form action={anonymizeUserAction} className="p-3 pt-0 space-y-3">
        <input name="user_id" type="hidden" value={userId} />
        <input name="expected_national_id" type="hidden" value={nationalId} />

        <p className="font-support-sm text-support-sm text-on-surface-variant">
          This cannot be undone. Purge the citizen&apos;s stored documents from object storage
          before erasing, or they are orphaned permanently.
        </p>

        <label className="block">
          <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
            Type {nationalId} to confirm
          </span>
          <input
            className="w-full px-3 py-2 bg-surface-container-lowest border border-outline-variant rounded font-mono text-support-sm"
            name="confirm_national_id"
            onChange={(event) => setTyped(event.target.value)}
            type="text"
            value={typed}
          />
        </label>

        <label className="flex items-start gap-2 font-support-sm text-support-sm text-on-surface">
          <input
            checked={purged}
            className="mt-0.5 w-4 h-4 rounded border-outline-variant"
            name="blobs_purged"
            onChange={(event) => setPurged(event.target.checked)}
            type="checkbox"
            value="yes"
          />
          Stored documents have already been purged.
        </label>

        <button
          className="w-full inline-flex items-center justify-center gap-1 border border-error bg-error-container text-on-error-container px-3 py-2 rounded font-label-sm text-label-sm disabled:opacity-40 focus-ring"
          disabled={!ready}
          type="submit"
        >
          Erase permanently
        </button>
      </form>
    </details>
  );
}
