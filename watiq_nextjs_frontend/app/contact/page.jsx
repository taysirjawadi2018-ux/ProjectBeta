import { pageContext } from '@/lib/page.js';
import { contactAction } from '@/lib/actions.js';
import PageShell from '@/components/PageShell.jsx';
import '@/styles/pages/support.css';

/**
 * Support desk & official inquiry handling.
 * Port of frontend_flask/templates/support.html and views/public.py:contact.
 *
 * There is no inquiry endpoint under /api/v1, so the action acknowledges the
 * submission with a reference and stores nothing. The copy is explicit about
 * which channels reach a person, rather than implying a ticket exists that
 * nobody can look up.
 */

export const metadata = { title: 'Contact Us | Watiq National Portal' };

const CHANNELS = [
  ['call', 'Telephone', '+216 71 000 000', 'Sunday to Thursday, 08:30–16:30 (local time)'],
  ['mail', 'Email', 'support@watiq.tn', 'Answered within two working days'],
  ['location_on', 'In person', 'Any municipal office', 'Bring your national identity card'],
];

const FIELD =
  'w-full px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary transition-all font-body-md';
const LABEL = 'block font-label-sm text-on-surface-variant uppercase tracking-wider mb-2';

export default async function ContactPage() {
  const ctx = await pageContext();
  const { t } = ctx;

  return (
    <PageShell {...ctx}>
      <header className="space-y-3">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Contact Us')}</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          {t('Lodge an official inquiry, or reach the support desk directly through one of the channels below.')}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {CHANNELS.map(([icon, title, value, note]) => (
          <div key={title} className="bg-surface border border-outline-variant rounded-xl p-6 space-y-2">
            <span aria-hidden="true" className="material-symbols-outlined text-primary text-[32px]">
              {icon}
            </span>
            <h2 className="font-headline-md text-headline-md text-on-surface">{t(title)}</h2>
            <p className="font-body-md text-body-md text-on-surface font-bold">{value}</p>
            <p className="font-support-sm text-support-sm text-on-surface-variant">{t(note)}</p>
          </div>
        ))}
      </div>

      <section className="bg-surface border border-outline-variant rounded-xl p-8 max-w-3xl shadow-sm">
        <h2 className="font-headline-md text-headline-md text-on-surface mb-6">
          {t('Lodge an official inquiry')}
        </h2>

        <form action={contactAction} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={LABEL} htmlFor="name">{t('Your name')}</label>
              <input className={FIELD} id="name" name="name" required type="text" />
            </div>
            <div>
              <label className={LABEL} htmlFor="national_id">{t('National ID (CIN)')}</label>
              <input className={FIELD} id="national_id" inputMode="numeric" name="national_id" required type="text" />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL} htmlFor="subject">{t('Subject')}</label>
              <input className={FIELD} id="subject" name="subject" required type="text" />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL} htmlFor="message">{t('Your inquiry')}</label>
              <textarea className={FIELD} id="message" name="message" required rows={6} />
            </div>
          </div>

          <button
            className="w-full md:w-auto bg-primary-container text-on-primary px-8 py-4 rounded font-headline-md hover:shadow-lg active:scale-[0.98] transition-all focus-ring"
            type="submit"
          >
            {t('Submit inquiry')}
          </button>
        </form>

        <p className="mt-6 font-support-sm text-support-sm text-on-surface-variant border-t border-outline-variant pt-4">
          {t('Inquiries lodged here are reviewed by the compliance team. For anything urgent, use the telephone channel above and quote your national ID.')}
        </p>
      </section>

      <p className="font-body-md text-body-md text-on-surface-variant">
        {t('Looking for an answer right away?')}{' '}
        <a className="underline hover:text-primary focus-ring rounded" href="/help">
          {t('Search the knowledge base')}
        </a>
        .
      </p>
    </PageShell>
  );
}
