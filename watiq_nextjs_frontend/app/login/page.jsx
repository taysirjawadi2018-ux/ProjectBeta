import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth.js';
import { pageTitle } from '@/lib/metadata.js';
import { getTranslator } from '@/lib/i18n.js';
import { noticeFor } from '@/lib/flash.js';
import { one } from '@/lib/view.js';
import LoginForm from './LoginForm.jsx';
import '@/styles/pages/login.css';

/**
 * Sign in. Port of frontend_flask/templates/login.html and the GET half of
 * views/public.py:login.
 *
 * ?staff=1 switches the form to the staff endpoint. It is a query parameter
 * rather than a separate route because nginx pins `location = /login` to the
 * login rate-limit zone by exact path — a second path would be unrationed, and
 * the staff form is the higher-value target of the two.
 */

export const generateMetadata = pageTitle('Watiq National Portal | Secure Login', { suffix: null });

export default async function LoginPage({ searchParams }) {
  // Already signed in: there is nothing to do here, and leaving the form up
  // invites someone to type credentials into a page that will ignore them.
  if (await isAuthenticated()) redirect('/dashboard');

  const query = await searchParams;
  const t = await getTranslator();
  const staffMode = one(query?.staff) === '1';
  const next = one(query?.next);
  const notice = noticeFor(one(query?.notice));
  const year = new Date().getFullYear();

  return (
    <div className="auth-bg min-h-screen flex flex-col relative overflow-y-auto">
      <div className="bg-asset-login-1 emblem-watermark" />

      <header className="w-full h-20 bg-primary-container border-b border-outline-variant z-20 flex items-center px-gutter sticky top-0">
        <div className="max-w-container-max mx-auto w-full flex justify-between items-center">
          <div className="flex items-center gap-md">
            <span className="font-headline-md text-white tracking-tighter">{t('Watiq')}</span>
            <div className="h-6 w-px bg-white/20 hidden md:block" />
            <span className="text-white/70 font-label-sm uppercase tracking-widest hidden md:block">
              {t('National Portal')}
            </span>
          </div>
          <div className="flex items-center gap-sm">
            <span className="text-white/60 font-label-sm hidden sm:block">
              {t('Secure Session Protocol v2.4')}
            </span>
            <span className="material-symbols-outlined text-white/60">lock</span>
          </div>
        </div>
      </header>

      <main id="main" className="flex-grow grid grid-cols-12 gap-gutter max-w-container-max mx-auto w-full p-margin-mobile md:p-margin-desktop z-10">
        <div className="hidden lg:flex lg:col-span-4 flex-col justify-center space-y-md">
          <h2 className="font-headline-lg text-midnight-navy">{t('Sovereign National Identity')}</h2>
          <p className="font-body-lg text-on-surface-variant">
            {t('The unified secure gateway for Tunisian citizens. Access e-government services, manage digital credentials, and interact with the legal infrastructure of the Republic.')}
          </p>
          <div className="space-y-sm pt-md">
            <div className="flex items-center gap-sm text-mediterranean-cerulean">
              <span className="material-symbols-outlined">verified_user</span>
              <span className="font-label-sm font-bold uppercase tracking-wider">
                {t('National Grade Encryption')}
              </span>
            </div>
            <div className="flex items-center gap-sm text-sovereign-gold">
              <span className="material-symbols-outlined">gavel</span>
              <span className="font-label-sm font-bold uppercase tracking-wider">
                {t('Legally Binding Signatures')}
              </span>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 flex flex-col justify-center">
          <div className="glass-card rounded-xl overflow-hidden relative">
            <div className="sovereign-line" />
            <div className="p-8 md:p-10">
              <div className="mb-10">
                <h1 className="font-headline-md text-midnight-navy mb-1">
                  {staffMode ? t('Staff Access Portal') : t('Access Portal')}
                </h1>
                <p className="font-body-md text-on-surface-variant">
                  {t('Enter your official credentials to proceed.')}
                </p>
              </div>

              {notice && (
                <div
                  className="mb-6 flex items-start gap-3 p-4 rounded-xl border bg-surface-container-low border-surface-variant text-on-surface"
                  role="status"
                >
                  <span aria-hidden="true" className="material-symbols-outlined">info</span>
                  <p className="font-body-md text-body-md">{t(notice.message)}</p>
                </div>
              )}

              <LoginForm staffMode={staffMode} next={next} />

              <div className="mt-10 pt-8 border-t border-outline-variant">
                <p className="font-body-md text-on-surface-variant text-center mb-4">
                  {t('First time accessing the portal?')}
                </p>
                <a
                  className="w-full block text-center font-label-sm font-bold text-midnight-navy border-2 border-midnight-navy px-8 py-3 rounded hover:bg-surface-variant transition-colors focus-ring"
                  href="/register"
                >
                  {t('Register Digital Identity')}
                </a>
                {/* The two forms are one route apart, and an officer arriving
                    at the citizen form has no other way across. */}
                <a
                  className="mt-4 w-full block text-center font-label-sm text-mediterranean-cerulean hover:underline focus-ring rounded"
                  href={staffMode ? '/login' : '/login?staff=1'}
                >
                  {staffMode ? t('Sign in as a citizen') : t('Staff sign-in')}
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:col-span-3 lg:flex flex-col justify-center items-end opacity-20">
          <span className="material-symbols-outlined text-[160px]">shield</span>
        </div>
      </main>

      <footer className="w-full py-lg bg-white border-t border-outline-variant z-10">
        <div className="max-w-container-max mx-auto px-gutter grid grid-cols-1 md:grid-cols-2 gap-md text-center md:text-start">
          <div>
            <p className="font-label-sm text-on-surface-variant opacity-70">
              © {year} {t('Republic of Tunisia — National Digital Sovereignty Department.')}
              <br />
              {t('Sovereign Infrastructure Secured by Watiq Protocol.')}
            </p>
          </div>
          <div className="flex justify-center md:justify-end gap-6 items-center">
            <div className="flex items-center gap-1 font-label-sm text-sovereign-gold">
              <span className="material-symbols-outlined text-[18px]">verified</span>
              {t('STATE COMPLIANT')}
            </div>
            <div className="flex items-center gap-1 font-label-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">fingerprint</span>
              {t('BIO-PROTECTED')}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
