'use client';

import { useActionState } from 'react';
import { loginAction } from '@/lib/actions.js';

/**
 * The credentials form.
 *
 * A client component only so the failure message can render without a full
 * navigation. It still degrades: <form action={serverAction}> posts natively
 * when JavaScript is off, and the action redirects on success either way.
 *
 * The password-visibility toggle is deliberately absent when scripting is off —
 * watiq.js adds nothing here, and a button that does nothing is worse than no
 * button. The input is a plain type="password" until then.
 */
export default function LoginForm({ staffMode = false, next = '' }) {
  const [state, formAction, pending] = useActionState(loginAction, null);

  const label = staffMode ? 'Staff email' : 'National ID (CIN)';
  const placeholder = staffMode ? 'name@ministry.tn' : '8-digit identity number';

  return (
    <form action={formAction} className="space-y-6" id="loginForm">
      {staffMode && <input name="mode" type="hidden" value="staff" />}
      {next && <input name="next" type="hidden" value={next} />}

      {state?.error && (
        <div
          className="flex items-start gap-3 p-4 rounded-xl border bg-error-container border-error text-on-error-container"
          role="alert"
        >
          <span aria-hidden="true" className="material-symbols-outlined">warning</span>
          <p className="font-body-md text-body-md">{state.error}</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="block font-label-sm text-on-surface-variant uppercase tracking-wider" htmlFor="cin">
          {label}
        </label>
        <div className="relative">
          <span className="absolute start-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline">
            badge
          </span>
          <input
            autoComplete="username"
            className="w-full ps-12 pe-4 py-4 bg-surface-container-lowest border border-outline-variant rounded hover:border-mediterranean-cerulean focus:ring-1 focus:ring-mediterranean-cerulean focus:border-mediterranean-cerulean transition-all font-body-md placeholder:text-outline-variant"
            id="cin"
            name={staffMode ? 'email' : 'cin'}
            placeholder={placeholder}
            required
            type={staffMode ? 'email' : 'text'}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <label
            className="block font-label-sm text-on-surface-variant uppercase tracking-wider"
            htmlFor="password"
          >
            Security Password
          </label>
          <a className="font-label-sm text-mediterranean-cerulean hover:underline" href="/password-reset">
            RECOVER ACCESS
          </a>
        </div>
        <div className="relative">
          <span className="absolute start-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline">
            key
          </span>
          <input
            autoComplete="current-password"
            className="w-full ps-12 pe-12 py-4 bg-surface-container-lowest border border-outline-variant rounded hover:border-mediterranean-cerulean focus:ring-1 focus:ring-mediterranean-cerulean focus:border-mediterranean-cerulean transition-all font-body-md placeholder:text-outline-variant"
            id="password"
            name="password"
            placeholder="••••••••"
            required
            type="password"
          />
          <button
            aria-label="Toggle password visibility"
            className="absolute end-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors p-1"
            data-action="toggle-password"
            data-target="password"
            type="button"
          >
            <span className="material-symbols-outlined text-xl">visibility</span>
          </button>
        </div>
      </div>

      <div className="pt-4">
        <button
          className="w-full bg-midnight-navy text-white py-4 font-headline-md rounded hover:bg-black active:scale-[0.98] transition-all flex justify-center items-center gap-3 shadow-lg shadow-midnight-navy/10 disabled:opacity-60 focus-ring"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Signing in…' : 'Secure Login'}
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </form>
  );
}
