import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth.js';
import { getTranslator } from '@/lib/i18n.js';
import RegisterForm from './RegisterForm.jsx';
import '@/styles/pages/register.css';

/**
 * Register a digital identity.
 * Port of frontend_flask/templates/register.html and views/public.py:register.
 */

export const metadata = { title: 'Register Digital Identity | Watiq National Portal' };

export default async function RegisterPage() {
  if (await isAuthenticated()) redirect('/dashboard');
  const t = await getTranslator();
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col bg-surface-container-low">
      <header className="w-full h-20 bg-primary-container border-b border-outline-variant flex items-center px-gutter">
        <div className="max-w-container-max mx-auto w-full flex justify-between items-center">
          <a className="flex items-center gap-md focus-ring rounded" href="/">
            <span className="font-headline-md text-white tracking-tighter">{t('Watiq')}</span>
            <div className="h-6 w-px bg-white/20 hidden md:block" />
            <span className="text-white/70 font-label-sm uppercase tracking-widest hidden md:block">
              {t('National Portal')}
            </span>
          </a>
          <a className="text-white/80 font-label-sm hover:text-white focus-ring rounded" href="/login">
            {t('Already registered? Sign in')}
          </a>
        </div>
      </header>

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
