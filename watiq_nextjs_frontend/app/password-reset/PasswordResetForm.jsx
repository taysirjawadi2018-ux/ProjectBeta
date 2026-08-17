'use client';

import { useActionState } from 'react';
import { passwordResetAction } from '@/lib/actions.js';

const FIELD =
  'w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary transition-all font-body-md';
const LABEL = 'block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2';

export default function PasswordResetForm({ stage }) {
  const [state, formAction, pending] = useActionState(passwordResetAction, null);

  return (
    <form action={formAction} className="space-y-6">
      <input name="stage" type="hidden" value={stage} />

      {state?.error && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border bg-error-container border-error text-on-error-container"
          role="alert"
        >
          <span aria-hidden="true" className="material-symbols-outlined">warning</span>
          <p className="font-body-md text-body-md">{state.error}</p>
        </div>
      )}

      {stage === 'request' ? (
        <div>
          <label className={LABEL} htmlFor="login">National ID (CIN)</label>
          <input className={FIELD} id="login" inputMode="numeric" name="login" required type="text" />
        </div>
      ) : (
        <>
          <div>
            <label className={LABEL} htmlFor="code">Reset code</label>
            <input autoComplete="one-time-code" className={FIELD} id="code" name="code" required type="text" />
          </div>
          <div>
            <label className={LABEL} htmlFor="new_password">New password</label>
            <input
              autoComplete="new-password"
              className={FIELD}
              id="new_password"
              name="new_password"
              required
              type="password"
            />
          </div>
        </>
      )}

      <button
        className="w-full bg-primary-container text-on-primary py-4 font-headline-md rounded hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 focus-ring"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Working…' : stage === 'request' ? 'Send reset code' : 'Change password'}
      </button>
    </form>
  );
}
