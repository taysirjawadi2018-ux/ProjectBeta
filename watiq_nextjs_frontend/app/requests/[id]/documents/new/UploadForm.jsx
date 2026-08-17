'use client';

import { useState } from 'react';
import { requestUploadUrlAction, confirmDocumentAction } from '@/lib/actions.js';

/**
 * Three steps, in the browser:
 *
 *   1. ask the server for a presigned PUT (a Server Action, so the access
 *      token stays on the server),
 *   2. PUT the bytes straight to object storage,
 *   3. confirm, so the API marks the document uploaded.
 *
 * The file never passes through the BFF. That is the whole design: a 10 MB
 * scan would otherwise occupy a Node process for the length of the upload, and
 * the storage key would have to cross into this page to be useful.
 *
 * This is the one screen that genuinely requires JavaScript — a plain form post
 * cannot PUT to a second origin — so it says so rather than appearing to work
 * and silently doing nothing.
 */
export default function UploadForm({ requestId, maxBytes }) {
  const [status, setStatus] = useState({ state: 'idle' });

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.file.files?.[0];
    const documentType = String(form.elements.document_type.value || '').trim();

    if (!file) {
      setStatus({ state: 'error', message: 'Choose a file to upload.' });
      return;
    }
    if (file.size > maxBytes) {
      // Checked here as well as at the API, so a 10 MB scan is refused before
      // it is sent rather than after.
      setStatus({
        state: 'error',
        message: `That file is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`,
      });
      return;
    }

    setStatus({ state: 'working', message: 'Requesting an upload slot…' });
    const brokered = await requestUploadUrlAction(
      requestId,
      documentType || file.name,
      file.type || 'application/octet-stream',
    );

    if (brokered.error) {
      setStatus({ state: 'error', message: brokered.error });
      return;
    }

    const { upload } = brokered;
    const url = upload?.presigned_url ?? upload?.url;
    if (!url) {
      setStatus({ state: 'error', message: 'The storage service did not offer an upload slot.' });
      return;
    }

    setStatus({ state: 'working', message: 'Uploading…' });
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      setStatus({
        state: 'error',
        message: 'The upload did not complete. Please check your connection and try again.',
      });
      return;
    }

    // Confirming is a form post so the redirect and the flash happen the same
    // way they would without any of the above.
    const confirmForm = new FormData();
    confirmForm.set('document_id', String(upload.id ?? upload.document_id ?? ''));
    confirmForm.set('next', `/requests/${requestId}`);
    await confirmDocumentAction(confirmForm);
  }

  const working = status.state === 'working';

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <noscript>
        <div
          className="flex items-start gap-3 p-4 rounded-xl border bg-tertiary-container border-tertiary text-on-tertiary-container"
          role="status"
        >
          <span aria-hidden="true" className="material-symbols-outlined">info</span>
          <p className="font-body-md text-body-md">
            Uploading needs JavaScript, because the file is sent straight to secure storage rather
            than through this site. Everything else on the portal works without it. You can also
            bring the document to any municipal office.
          </p>
        </div>
      </noscript>

      {status.state === 'error' && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border bg-error-container border-error text-on-error-container"
          role="alert"
        >
          <span aria-hidden="true" className="material-symbols-outlined">warning</span>
          <p className="font-body-md text-body-md">{status.message}</p>
        </div>
      )}

      {working && (
        <p className="font-body-md text-body-md text-on-surface-variant" role="status">
          {status.message}
        </p>
      )}

      <div>
        <label
          className="block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2"
          htmlFor="document_type"
        >
          What this document is
        </label>
        <input
          className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
          id="document_type"
          name="document_type"
          placeholder="National ID scan, proof of address…"
          type="text"
        />
      </div>

      <div>
        <label className="block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2" htmlFor="file">
          File
        </label>
        <input
          accept="application/pdf,image/png,image/jpeg"
          className="w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded font-body-md file:me-4 file:rounded file:border-0 file:bg-primary-container file:px-4 file:py-2 file:text-on-primary"
          id="file"
          name="file"
          required
          type="file"
        />
        <p className="mt-2 font-support-sm text-support-sm text-on-surface-variant">
          PDF, PNG or JPEG, up to {Math.round(maxBytes / 1024 / 1024)} MB.
        </p>
      </div>

      <button
        className="w-full md:w-auto bg-primary-container text-on-primary px-8 py-4 rounded font-headline-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 focus-ring"
        disabled={working}
        type="submit"
      >
        {working ? 'Working…' : 'Upload document'}
      </button>
    </form>
  );
}
