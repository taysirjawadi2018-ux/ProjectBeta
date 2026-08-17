import { pageContext } from '@/lib/page.js';
import { pageTitle } from '@/lib/metadata.js';
import { one, query as qs } from '@/lib/view.js';
import { FAQ, FAQ_TOPICS } from '@/lib/faq.js';
import PageShell from '@/components/PageShell.jsx';
import '@/styles/pages/faq.css';

/**
 * The knowledge base.
 * Port of frontend_flask/templates/faq.html and views/public.py:help_page.
 *
 * /help and /contact used to render the same template with a different heading.
 * The second mockup drop gave each its own design — a searchable FAQ here, the
 * inquiry form and chat under /contact — so they no longer share one.
 *
 * <details>/<summary> rather than scripted accordions: it opens without
 * JavaScript, it is keyboard-operable for free, and a screen reader announces
 * the expanded state without any aria bookkeeping.
 */

export const generateMetadata = pageTitle('Help & Support');

export default async function HelpPage({ searchParams }) {
  const params = await searchParams;
  const ctx = await pageContext();
  const { t } = ctx;

  const queryText = one(params?.q).trim();
  const topic = one(params?.topic).trim();

  let entries = topic ? FAQ.filter((e) => e.topic === topic) : FAQ;
  if (queryText) {
    const needle = queryText.toLowerCase();
    entries = entries.filter(
      (e) => e.question.toLowerCase().includes(needle) || e.answer.toLowerCase().includes(needle),
    );
  }

  const grouped = FAQ_TOPICS.map((name) => [name, entries.filter((e) => e.topic === name)]).filter(
    ([, list]) => list.length > 0,
  );

  return (
    <PageShell {...ctx}>
      <header className="space-y-3">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Help & Support')}</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
          {t('Answers to the questions the support desk is asked most often.')}
        </p>
      </header>

      <form action="/help" className="flex flex-col sm:flex-row gap-3 max-w-2xl" method="get" role="search">
        {topic && <input name="topic" type="hidden" value={topic} />}
        <label className="sr-only" htmlFor="q">{t('Search the knowledge base')}</label>
        <input
          className="flex-1 px-4 py-3 bg-surface border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary font-body-md"
          defaultValue={queryText}
          id="q"
          name="q"
          placeholder={t('Search the knowledge base')}
          type="search"
        />
        <button
          className="bg-primary-container text-on-primary px-8 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
          type="submit"
        >
          {t('Search')}
        </button>
      </form>

      <nav aria-label={t('Topics')} className="flex flex-wrap gap-2">
        <a
          className={`font-label-sm text-label-sm px-4 py-2 rounded-full border transition-colors focus-ring ${
            topic
              ? 'border-outline-variant text-on-surface hover:bg-surface-container-low'
              : 'bg-primary-container text-on-primary border-primary-container'
          }`}
          href={`/help${qs({ q: queryText })}`}
        >
          {t('All topics')}
        </a>
        {FAQ_TOPICS.map((name) => (
          <a
            key={name}
            aria-current={topic === name ? 'page' : undefined}
            className={`font-label-sm text-label-sm px-4 py-2 rounded-full border transition-colors focus-ring ${
              topic === name
                ? 'bg-primary-container text-on-primary border-primary-container'
                : 'border-outline-variant text-on-surface hover:bg-surface-container-low'
            }`}
            href={`/help${qs({ q: queryText, topic: name })}`}
          >
            {t(name)}
          </a>
        ))}
      </nav>

      {entries.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-outline-variant rounded-xl">
          <span aria-hidden="true" className="material-symbols-outlined text-[48px] text-outline">
            search_off
          </span>
          <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant">
            {t('No article matches. Try a different term, or ask the support desk directly.')}
          </p>
          <a
            className="mt-6 inline-flex items-center gap-2 bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md focus-ring"
            href="/contact"
          >
            {t('Contact support')}
          </a>
        </div>
      ) : (
        grouped.map(([name, list]) => (
          <section key={name} className="space-y-3">
            <h2 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
              <span aria-hidden="true" className="material-symbols-outlined text-primary">
                {list[0].icon}
              </span>
              {t(name)}
            </h2>
            {list.map((entry) => (
              <details
                key={entry.question}
                className="bg-surface border border-outline-variant rounded-xl overflow-hidden group"
              >
                <summary className="cursor-pointer list-none p-5 flex items-center justify-between gap-4 font-body-lg text-body-lg text-on-surface hover:bg-surface-container-low focus-ring">
                  {t(entry.question)}
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-on-surface-variant transition-transform group-open:rotate-180"
                  >
                    expand_more
                  </span>
                </summary>
                <p className="px-5 pb-5 font-body-md text-body-md text-on-surface-variant">
                  {t(entry.answer)}
                </p>
              </details>
            ))}
          </section>
        ))
      )}

      <p className="font-support-sm text-support-sm text-on-surface-variant border-t border-outline-variant pt-6">
        {t('Showing')} {entries.length} {t('of')} {FAQ.length} {t('articles.')}
      </p>
    </PageShell>
  );
}
