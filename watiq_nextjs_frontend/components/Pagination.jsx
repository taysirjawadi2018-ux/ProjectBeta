import { pagination, query as qs } from '@/lib/view.js';

/**
 * Page links for a total/size pair.
 *
 * Renders nothing when there is only one page — a disabled pager on a
 * three-row list is noise. Real links, not buttons, so the page is
 * bookmarkable and works without scripting.
 */
export default function Pagination({ total, page, size = 20, base, params = {}, t = (s) => s }) {
  const state = pagination({ total, page, size });
  if (!state) return null;

  return (
    <nav aria-label={t('Pagination')} className="flex items-center justify-between gap-4 pt-4">
      {state.hasPrev ? (
        <a
          className="inline-flex items-center gap-2 border border-outline-variant px-4 py-2 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
          href={`${base}${qs({ ...params, page: state.prev })}`}
          rel="prev"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_back</span>
          {t('Previous')}
        </a>
      ) : (
        <span />
      )}

      <p className="font-label-sm text-label-sm text-on-surface-variant" role="status">
        {t('Page')} {state.page} {t('of')} {state.pages}
      </p>

      {state.hasNext ? (
        <a
          className="inline-flex items-center gap-2 border border-outline-variant px-4 py-2 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
          href={`${base}${qs({ ...params, page: state.next })}`}
          rel="next"
        >
          {t('Next')}
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}
