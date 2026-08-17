'use client';

import { useActionState } from 'react';
import { mfaAction } from '@/lib/actions.js';

/**
 * The design splits the code across six single-character boxes, all named
 * "code". The action joins them, so the form works with JavaScript disabled;
 * watiq.js adds the auto-advance between boxes on top.
 *
 * inputMode="numeric" rather than type="number": a number input on a phone
 * offers a spinner and strips leading zeros, and an authenticator code can
 * begin with one.
 */
export default function MfaForm() {
  const [state, formAction, pending] = useActionState(mfaAction, null);

  return (
    <form action={formAction} className="space-y-6" data-mfa-form>
      {state?.error && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border bg-error-container border-error text-on-error-container"
          role="alert"
        >
          <span aria-hidden="true" className="material-symbols-outlined">warning</span>
          <p className="font-body-md text-body-md">{state.error}</p>
        </div>
      )}

      <fieldset>
        <legend className="block font-label-sm text-on-surface-variant uppercase tracking-wider mb-3">
          Verification code
        </legend>
        <div className="flex justify-between gap-2" dir="ltr">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <input
              key={index}
              aria-label={`Digit ${index + 1}`}
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              className="w-full h-14 text-center font-headline-md text-headline-md bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              inputMode="numeric"
              maxLength={1}
              name="code"
              pattern="[0-9]"
              required
              type="text"
            />
          ))}
        </div>
      </fieldset>

      <button
        className="w-full bg-primary-container text-on-primary py-4 font-headline-md rounded hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 focus-ring"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Verifying…' : 'Verify and continue'}
      </button>
    </form>
  );
}
