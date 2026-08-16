'use client';

import { useActionState } from 'react';
import { submitRequestAction } from '@/lib/actions.js';

const FIELD =
  'w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary transition-all font-body-md';
const LABEL = 'block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2';

/**
 * Everything not a control field is posted as form_data. The action strips
 * office_service_id / priority_id / office_id and the Server Action's own
 * internal keys; the API enforces the real limits (64 KB, depth 8, 200 keys).
 *
 * The fields below are the ones every service in this catalogue asks for. There
 * is no per-service form schema in the API to drive them from, so they are
 * fixed here rather than invented per service — and any that are left blank are
 * dropped instead of being sent as "".
 */
export default function SubmitRequestForm({ officeId, officeServices, preselectCatalogId }) {
  const [state, formAction, pending] = useActionState(submitRequestAction, null);

  const preselected =
    officeServices.find((s) => s.catalogId === preselectCatalogId)?.id ?? '';

  return (
    <form action={formAction} className="space-y-6">
      <input name="office_id" type="hidden" value={officeId} />

      {state?.error && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border bg-error-container border-error text-on-error-container"
          role="alert"
        >
          <span aria-hidden="true" className="material-symbols-outlined">warning</span>
          <p className="font-body-md text-body-md">{state.error}</p>
        </div>
      )}

      <div>
        <label className={LABEL} htmlFor="office_service_id">Service</label>
        <select className={FIELD} defaultValue={preselected} id="office_service_id" name="office_service_id" required>
          <option value="">Select a service…</option>
          {officeServices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.fee}
              {s.processing ? ` · ${s.processing} days` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className={LABEL} htmlFor="full_name">Full name as it appears on your CIN</label>
          <input className={FIELD} id="full_name" name="full_name" required type="text" />
        </div>
        <div>
          <label className={LABEL} htmlFor="place_of_birth">Place of birth</label>
          <input className={FIELD} id="place_of_birth" name="place_of_birth" type="text" />
        </div>
        <div>
          <label className={LABEL} htmlFor="contact_phone">Contact phone</label>
          <input className={FIELD} id="contact_phone" name="contact_phone" type="tel" />
        </div>
        <div>
          <label className={LABEL} htmlFor="copies">Number of copies</label>
          <input className={FIELD} defaultValue="1" id="copies" min="1" name="copies" type="number" />
        </div>
        <div className="md:col-span-2">
          <label className={LABEL} htmlFor="purpose">
            What the document is for <span className="normal-case">(optional)</span>
          </label>
          <textarea className={FIELD} id="purpose" name="purpose" rows={4} />
        </div>
      </div>

      <button
        className="w-full md:w-auto bg-primary-container text-on-primary px-8 py-4 rounded font-headline-md hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 focus-ring"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
