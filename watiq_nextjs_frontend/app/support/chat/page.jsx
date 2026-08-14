import { pageContext } from '@/lib/page.js';
import { supportChatAction } from '@/lib/actions.js';
import PageShell from '@/components/PageShell.jsx';
import '@/styles/pages/support_chat.css';

/**
 * The live-chat screen.
 * Port of frontend_flask/templates/support_chat.html and
 * views/public.py:support_chat.
 *
 * There is no chat backend — no websocket, nothing under /api/v1 that accepts a
 * message — so the composer posts to an action that says plainly the channel is
 * not live and points at the phone and email that are. The design is the
 * mockup's; the promise is not.
 */

export const metadata = { title: 'Live Support | Watiq National Portal' };

export default async function SupportChatPage() {
  const ctx = await pageContext();
  const { t } = ctx;

  return (
    <PageShell {...ctx}>
      <header className="space-y-3">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Live Support')}</h1>
      </header>

      <div
        className="flex items-start gap-3 p-4 rounded-xl border bg-tertiary-container border-tertiary text-on-tertiary-container max-w-3xl"
        role="status"
      >
        <span aria-hidden="true" className="material-symbols-outlined">info</span>
        <div className="font-body-md text-body-md space-y-1">
          <p className="font-bold">{t('This channel is not live yet.')}</p>
          <p>
            {t('Messages sent here are not received by anyone. The telephone and email channels on the contact page are staffed; quote your national ID when you reach them.')}
          </p>
        </div>
      </div>

      <section className="bg-surface border border-outline-variant rounded-xl max-w-3xl shadow-sm overflow-hidden">
        <div className="border-b border-outline-variant px-6 py-4 flex items-center gap-3">
          <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-outline" />
          <p className="font-label-md text-label-md text-on-surface-variant">{t('Support desk — offline')}</p>
        </div>

        <div className="p-6 space-y-4 min-h-[16rem]" aria-live="polite">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0">
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">support_agent</span>
            </div>
            <div className="bg-surface-container-low rounded-xl rounded-ss-none p-4 max-w-lg">
              <p className="font-body-md text-body-md text-on-surface">
                {t('The live channel has not been connected. Please use the telephone or email channel listed on the contact page.')}
              </p>
            </div>
          </div>
        </div>

        <form action={supportChatAction} className="border-t border-outline-variant p-4 flex gap-3">
          <label className="sr-only" htmlFor="message">{t('Your message')}</label>
          <input
            className="flex-1 px-4 py-3 bg-surface-container-lowest border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
            id="message"
            name="message"
            placeholder={t('Type a message…')}
            type="text"
          />
          <button
            className="bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
            type="submit"
          >
            {t('Send')}
          </button>
        </form>
      </section>

      <a className="inline-flex items-center gap-2 font-label-md text-label-md text-primary hover:underline focus-ring rounded" href="/contact">
        <span aria-hidden="true" className="material-symbols-outlined">arrow_back</span>
        {t('Back to contact options')}
      </a>
    </PageShell>
  );
}
