'use client';

import { useActionState } from 'react';
import { registerAction } from '@/lib/actions.js';

const FIELD =
  'w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary transition-all font-body-md';
const LABEL = 'block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2';

/**
 * Only national_id, first_name, last_name and password are required — the API's
 * RegisterIn treats the rest as optional, and the action omits an empty
 * optional rather than sending "", which the schema rejects.
 *
 * The typed values are echoed back on failure so a rejected submission does not
 * make someone retype their address.
 */
export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, null);
  const form = state?.form ?? {};

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border bg-error-container border-error text-on-error-container"
          role="alert"
        >
          <span aria-hidden="true" className="material-symbols-outlined">warning</span>
          <p className="font-body-md text-body-md">{state.error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className={LABEL} htmlFor="national_id">National ID (CIN)</label>
          <input
            className={FIELD}
            defaultValue={form.national_id ?? ''}
            id="national_id"
            inputMode="numeric"
            name="national_id"
            placeholder="8-digit identity number"
            required
            type="text"
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="first_name">First name</label>
          <input className={FIELD} defaultValue={form.first_name ?? ''} id="first_name" name="first_name" required type="text" />
        </div>
        <div>
          <label className={LABEL} htmlFor="last_name">Last name</label>
          <input className={FIELD} defaultValue={form.last_name ?? ''} id="last_name" name="last_name" required type="text" />
        </div>

        <div>
          <label className={LABEL} htmlFor="email">Email <span className="normal-case">(optional)</span></label>
          <input className={FIELD} defaultValue={form.email ?? ''} id="email" name="email" type="email" />
        </div>
        <div>
          <label className={LABEL} htmlFor="phone">Phone <span className="normal-case">(optional)</span></label>
          <input className={FIELD} defaultValue={form.phone ?? ''} id="phone" name="phone" type="tel" />
        </div>

        <div>
          <label className={LABEL} htmlFor="date_of_birth">Date of birth <span className="normal-case">(optional)</span></label>
          <input className={FIELD} defaultValue={form.date_of_birth ?? ''} id="date_of_birth" name="date_of_birth" type="date" />
        </div>
        <div>
          <label className={LABEL} htmlFor="governorate">Governorate <span className="normal-case">(optional)</span></label>
          <input className={FIELD} defaultValue={form.governorate ?? ''} id="governorate" name="governorate" type="text" />
        </div>
        <div className="md:col-span-2">
          <label className={LABEL} htmlFor="city">City <span className="normal-case">(optional)</span></label>
          <input className={FIELD} defaultValue={form.city ?? ''} id="city" name="city" type="text" />
        </div>

        <div>
          <label className={LABEL} htmlFor="password">Password</label>
          <input autoComplete="new-password" className={FIELD} id="password" name="password" required type="password" />
        </div>
        <div>
          <label className={LABEL} htmlFor="password_confirm">Confirm password</label>
          <input
            autoComplete="new-password"
            className={FIELD}
            id="password_confirm"
            name="password_confirm"
            required
            type="password"
          />
        </div>
      </div>

      <button
        className="w-full bg-primary-container text-on-primary py-4 font-headline-md rounded hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 focus-ring"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  );
}
