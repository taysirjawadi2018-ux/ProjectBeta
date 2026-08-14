import { getTranslator } from '@/lib/i18n.js';
import { one } from '@/lib/view.js';
import PasswordResetForm from './PasswordResetForm.jsx';
import '@/styles/pages/password_reset.css';

/**
 * Account recovery, in two stages driven by ?stage=.
 * Port of frontend_flask/templates/password_reset.html and
 * views/public.py:password_reset.
 *
 * The request stage always reports the same thing whether or not the account
 * exists — anything else makes this form an account-existence oracle.
 */

export const metadata = { title: 'Recover Access | Watiq National Portal' };

export default async function PasswordResetPage({ searchParams }) {
  const query = await searchParams;
  const t = await getTranslator();
  const stage = one(query?.stage) === 'confirm' ? 'confirm' : 'request';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-container-low px-margin-mobile py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-primary-container text-on-primary mx-auto flex items-center justify-center mb-4">
            <span aria-hidden="true" className="material-symbols-outlined text-[32px]">lock_reset</span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">{t('Recover Access')}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {stage === 'request'
              ? t('Enter your national ID. If an account exists, a reset code will be sent to the contact details on record.')
              : t('Enter the code you received and choose a new password.')}
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-outline-variant p-8 shadow-sm">
          <PasswordResetForm stage={stage} />
        </div>

        <p className="mt-6 text-center font-support-sm text-support-sm text-on-surface-variant">
          {t('Recovery is verified against the phone number registered to your CIN. If that number has changed, recovery has to be done in person at any municipal office.')}
        </p>

        <p className="mt-4 text-center">
          <a className="font-label-sm text-mediterranean-cerulean hover:underline focus-ring rounded" href="/login">
            {t('Back to sign in')}
          </a>
        </p>
      </div>
    </div>
  );
}
