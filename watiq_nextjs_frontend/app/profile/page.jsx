import { pageContext } from '@/lib/page.js';
import { pageTitle } from '@/lib/metadata.js';
import { requireLogin } from '@/lib/guards.js';
import { displayName } from '@/lib/format.js';
import { formatDate } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import '@/styles/pages/profile.css';

/**
 * Account settings.
 * Port of frontend_flask/templates/profile.html and views/citizen.py:profile.
 *
 * Read-only. The API exposes GET /auth/me and GET /staff/me but no
 * citizen-facing update endpoint, so this shows the record and does not pretend
 * it can be edited here — an input that silently discards what you type is
 * worse than no input.
 */

export const generateMetadata = pageTitle('Your Profile');

export default async function ProfilePage() {
  await requireLogin('/profile');
  const ctx = await pageContext();
  const { t, profile, isStaff } = ctx;

  const fields = isStaff
    ? [
        [t('Name'), profile?.name],
        [t('Email'), profile?.email],
        [t('Office'), profile?.office_name],
        [t('Role'), profile?.role_name],
      ]
    : [
        [t('First name'), profile?.first_name],
        [t('Last name'), profile?.last_name],
        [t('National ID (CIN)'), profile?.national_id],
        [t('Email'), profile?.email],
        [t('Phone'), profile?.phone],
        [t('Date of birth'), profile?.date_of_birth ? formatDate(profile.date_of_birth) : null],
        [t('Governorate'), profile?.governorate],
        [t('City'), profile?.city],
      ];

  return (
    <PageShell {...ctx}>
      <header className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary-container text-on-primary flex items-center justify-center">
          <span aria-hidden="true" className="material-symbols-outlined text-[32px]">account_circle</span>
        </div>
        <div className="space-y-1">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {profile ? displayName(profile) : t('Your Profile')}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {isStaff ? t('Staff account') : t('Citizen account')}
          </p>
        </div>
      </header>

      <section className="bg-surface border border-outline-variant rounded-xl p-8 shadow-sm max-w-2xl">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-6">
          {t('Your record')}
        </h2>

        <dl className="divide-y divide-outline-variant">
          {fields.map(([label, value]) => (
            <div key={label} className="py-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <dt className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
                {label}
              </dt>
              <dd className="sm:col-span-2 font-body-md text-body-md text-on-surface">
                {value || '—'}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 pt-6 border-t border-outline-variant bg-surface-container-low -mx-8 -mb-8 px-8 py-6 rounded-b-xl">
          <h3 className="font-label-md text-label-md text-on-surface mb-2">
            {t('Changing your details')}
          </h3>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {t('Civil-status details are held in the national registry and cannot be edited here. To correct them, visit any municipal office with your identity card.')}
          </p>
        </div>
      </section>

      <section className="max-w-2xl">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-4">{t('Security')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            className="bg-surface border border-outline-variant rounded-xl p-6 flex flex-col gap-3 hover:bg-surface-container-low transition-colors focus-ring"
            href="/security-log"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">shield</span>
            <span className="font-label-md text-label-md text-on-surface">{t('Security log')}</span>
            <span className="font-support-sm text-support-sm text-on-surface-variant">
              {t('Who has accessed your record, and when.')}
            </span>
          </a>
          <a
            className="bg-surface border border-outline-variant rounded-xl p-6 flex flex-col gap-3 hover:bg-surface-container-low transition-colors focus-ring"
            href="/password-reset"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[28px] text-primary">lock_reset</span>
            <span className="font-label-md text-label-md text-on-surface">{t('Change your password')}</span>
            <span className="font-support-sm text-support-sm text-on-surface-variant">
              {t('A reset code is sent to the number registered to your CIN.')}
            </span>
          </a>
        </div>
      </section>
    </PageShell>
  );
}
