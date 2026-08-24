import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth.js';
import { pageTitle } from '@/lib/metadata.js';
import { getTranslator } from '@/lib/i18n.js';
import RegisterForm from './RegisterForm.jsx';
import '@/styles/pages/register.css';

/**
 * Register a digital identity.
 * Port of frontend_flask/templates/register.html and views/public.py:register.
 */

export const generateMetadata = pageTitle('Register Digital Identity');

export default async function RegisterPage() {
  if (await isAuthenticated()) redirect('/dashboard');
  const t = await getTranslator();
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col bg-surface-container-low">
      <main id="main" className="flex-grow w-full max-w-3xl mx-auto px-margin-mobile py-12">
        <div className="mb-8">
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-2">
            {t('Register Digital Identity')}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {t('Your national identity card number and a password are all that is required. Everything else can be added later from your profile.')}
          </p>
        </div>

        <div className="bg-surface rounded-xl border border-outline-variant p-8 shadow-sm">
          <RegisterForm />
        </div>

        <p className="mt-6 font-support-sm text-support-sm text-on-surface-variant">
          {t('By registering you accept the')}{' '}
          <a className="underline hover:text-primary focus-ring rounded" href="/legal/terms">
            {t('Terms of Service')}
          </a>{' '}
          {t('and the')}{' '}
          <a className="underline hover:text-primary focus-ring rounded" href="/legal/privacy">
            {t('Privacy Policy')}
          </a>
          .
        </p>
      </main>

      <footer className="w-full py-lg bg-white border-t border-outline-variant">
        <p className="max-w-container-max mx-auto px-gutter font-label-sm text-on-surface-variant opacity-70">
          © {year} {t('Republic of Tunisia — National Digital Sovereignty Department.')}
        </p>
      </footer>
    </div>
  );
}
