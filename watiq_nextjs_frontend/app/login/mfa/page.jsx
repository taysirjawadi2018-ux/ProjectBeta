import { redirect } from 'next/navigation';
import { isAuthenticated, currentProfile } from '@/lib/auth.js';
import { pageTitle } from '@/lib/metadata.js';
import { getTranslator } from '@/lib/i18n.js';
import { displayName } from '@/lib/format.js';
import MfaForm from './MfaForm.jsx';
import '@/styles/pages/mfa.css';

/**
 * Step-up for a partial staff session (Backend.md §6.4).
 * Port of frontend_flask/templates/mfa.html and views/public.py:mfa.
 */

export const generateMetadata = pageTitle('Two-Factor Verification');

export default async function MfaPage() {
  // A partial session is still a session; without one there is nothing to
  // step up from, and the staff form is where that starts.
  if (!(await isAuthenticated())) redirect('/login?staff=1');

  const t = await getTranslator();
  const profile = await currentProfile();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-container-low px-margin-mobile py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary-container text-on-primary mx-auto flex items-center justify-center mb-4">
            <span aria-hidden="true" className="material-symbols-outlined text-[32px]">
              encrypted
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">
            {t('Two-Factor Verification')}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('Enter the six-digit code from your authenticator application.')}
          </p>
          {profile && (
            <p className="mt-3 font-label-sm text-label-sm text-on-surface-variant">
              {t('Signed in as')} <strong>{displayName(profile)}</strong>
            </p>
          )}
        </div>

        <div className="bg-surface rounded-xl border border-outline-variant p-8 shadow-sm">
          <MfaForm />
        </div>

        <p className="mt-6 text-center font-support-sm text-support-sm text-on-surface-variant">
          {t('Lost your device? Contact your office administrator — the code cannot be reset from this screen.')}
        </p>
      </div>
    </div>
  );
}
