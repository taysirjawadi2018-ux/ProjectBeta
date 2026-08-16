/**
 * The empty state.
 *
 * `message` is expected to name what was actually asked for rather than saying
 * "nothing here" — an empty list after a filter and an empty list because the
 * citizen has never filed anything are different situations, and only one of
 * them is solved by clearing a filter.
 */
export default function EmptyState({ icon = 'inbox', message, action }) {
  return (
    <div className="text-center py-16 border border-dashed border-outline-variant rounded-xl">
      <span aria-hidden="true" className="material-symbols-outlined text-[48px] text-outline">
        {icon}
      </span>
      <p className="mt-4 font-body-lg text-body-lg text-on-surface-variant">{message}</p>
      {action && (
        <a
          className="mt-6 inline-flex items-center gap-2 bg-primary-container text-on-primary px-6 py-3 rounded font-label-md text-label-md hover:shadow-lg transition-all focus-ring"
          href={action.href}
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
