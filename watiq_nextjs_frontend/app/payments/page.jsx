import { tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { pageContext } from '@/lib/page.js';
import { requireLogin } from '@/lib/guards.js';
import { formatDate, formatMoney, query as qs } from '@/lib/view.js';
import PageShell from '@/components/PageShell.jsx';
import StatusBadge from '@/components/StatusBadge.jsx';
import EmptyState from '@/components/EmptyState.jsx';

/** Port of frontend_flask/templates/payments.html and views/citizen.py:payments. */

export const metadata = { title: 'Payments | Watiq National Portal' };

export default async function PaymentsPage() {
  await requireLogin('/payments');
  const ctx = await pageContext();
  const { t } = ctx;

  const payments = itemsOf(await tryGet('/api/v1/payments', {}));

  return (
    <PageShell active="payments" {...ctx}>
      <header className="space-y-2">
        <h1 className="font-headline-lg text-headline-lg text-on-surface">{t('Payments')}</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('Every fee you have paid, with the receipt reference you will be asked for at the counter.')}
        </p>
      </header>

      {payments.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          message={t('You have not made a payment yet.')}
          action={{ href: '/requests', label: t('Go to your requests') }}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-outline-variant rounded-xl overflow-hidden bg-surface">
            <caption className="sr-only">{t('Your payments')}</caption>
            <thead className="bg-surface-container-high">
              <tr>
                {['Service', 'Amount', 'Status', 'Paid', 'Receipt'].map((heading) => (
                  <th
                    key={heading}
                    className="text-start font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide px-4 py-3"
                    scope="col"
                  >
                    {t(heading)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface">
                    {payment.service_name ?? t('Fee')}
                  </td>
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface font-bold">
                    {formatMoney(payment.amount, payment.currency ?? 'TND')}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={payment.status} />
                  </td>
                  <td className="px-4 py-4 font-body-md text-body-md text-on-surface-variant">
                    {formatDate(payment.paid_at, { withTime: true })}
                  </td>
                  <td className="px-4 py-4">
                    <a
                      className="font-label-md text-label-md text-primary hover:underline focus-ring rounded"
                      href={`/payments/confirmation${qs({ id: payment.id })}`}
                    >
                      {t('View receipt')}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
