import { tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { one, formatDate, query as qs } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import EmptyState from '@/components/EmptyState.jsx';
import { markNotificationReadAction, markAllNotificationsReadAction } from '@/lib/actions.js';
import '@/styles/pages/notification_center.css';

/**
 * Notifications are cursor-paginated, not page-numbered.
 * Port of frontend_flask/templates/notification_center.html and
 * views/citizen.py:notifications.
 *
 * The list endpoint answers {items, next_cursor, unread_count} and NO total, so
 * next_cursor drives a "Load more" link rather than a numbered pager — the
 * mockup's button had nothing behind it because there is no page count to
 * compute.
 */

export const metadata = { title: 'Notifications | Watiq National Portal' };

export default async function NotificationsPage({ searchParams }) {
  await requireLogin('/notifications');
  const params = await searchParams;
  const ctx = await pageContext();
  const { t } = ctx;

  const cursor = one(params?.cursor);
  const data = (await tryGet('/api/v1/notifications', {}, cursor ? { params: { cursor } } : undefined)) ?? {};

  const notifications = itemsOf(data);
  const nextCursor = data && typeof data === 'object' ? data.next_cursor : null;
  // `unread_count`, not `count`. Reading the wrong key made this permanently 0.
  const unread = data && typeof data === 'object' ? data.unread_count : null;

  return (
    <PageShell active="requests" {...ctx}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Notifications')}</h1>
          {unread !== null && unread !== undefined && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {unread} {t('unread')}
            </p>
          )}
        </div>

        {Number(unread) > 0 && (
          <form action={markAllNotificationsReadAction}>
            <button
              className="inline-flex items-center gap-2 border border-outline-variant px-5 py-2.5 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
              type="submit"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">done_all</span>
              {t('Mark all as read')}
            </button>
          </form>
        )}
      </header>

      {notifications.length === 0 ? (
        <EmptyState icon="notifications_none" message={t('You have no notifications.')} />
      ) : (
        <ul className="space-y-3">
          {notifications.map((item) => (
            <li
              key={item.id}
              className={`rounded-xl border p-5 flex flex-wrap items-start justify-between gap-4 ${
                item.is_read
                  ? 'bg-surface border-outline-variant'
                  : 'bg-tertiary-container border-tertiary'
              }`}
            >
              <div className="min-w-0 space-y-1">
                <p className="font-body-lg text-body-lg text-on-surface font-bold">{item.title}</p>
                <p className="font-body-md text-body-md text-on-surface-variant">{item.message}</p>
                <p className="font-support-sm text-support-sm text-on-surface-variant">
                  {formatDate(item.created_at, { withTime: true })}
                  {item.sent_via ? ` · ${item.sent_via}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {item.request_id && (
                  <a
                    className="inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline focus-ring rounded"
                    href={`/requests/${item.request_id}`}
                  >
                    {t('Open request')}
                    <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </a>
                )}
                {!item.is_read && (
                  <form action={markNotificationReadAction}>
                    <input name="notification_id" type="hidden" value={item.id} />
                    <button
                      className="inline-flex items-center gap-1 border border-outline-variant px-3 py-2 rounded font-label-sm text-label-sm hover:bg-surface-container-low transition-colors focus-ring"
                      type="submit"
                    >
                      {t('Mark as read')}
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <a
          className="inline-flex items-center gap-2 border border-outline-variant px-6 py-3 rounded font-label-md text-label-md hover:bg-surface-container-low transition-colors focus-ring"
          href={`/notifications${qs({ cursor: nextCursor })}`}
          rel="next"
        >
          {t('Load more')}
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">expand_more</span>
        </a>
      )}
    </PageShell>
  );
}
