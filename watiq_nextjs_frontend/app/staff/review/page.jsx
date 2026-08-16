import { apiGet, tryGet } from '@/lib/api.js';
import { itemsOf } from '@/lib/format.js';
import { requireStaff } from '@/lib/guards.js';
import { getTranslator } from '@/lib/i18n.js';
import { role as sessionRole } from '@/lib/auth.js';
import { errorViewFor } from '@/lib/errors.js';
import { failureContext } from '@/lib/failure.js';
import ReviewScreen from '@/components/ReviewScreen.jsx';
import FailureScreen from '@/components/FailureScreen.jsx';
import '@/styles/pages/verify_request.css';

/**
 * The next item in the queue, which is how an officer works through a shift.
 * Port of views/staff.py:review with no request_id.
 */

export const metadata = { title: 'Review | Watiq Back Office' };

export default async function ReviewNextPage() {
  await requireStaff('/staff/review');
  const t = await getTranslator();
  const role = await sessionRole();

  const [queue, staff, permissionsData] = await Promise.all([
    tryGet('/api/v1/requests/office/queue', {}, { params: { size: 1 } }),
    tryGet('/api/v1/staff/me', null),
    tryGet('/api/v1/staff/me/permissions', {}),
  ]);

  const first = itemsOf(queue)[0];
  const permissions = permissionsData?.permissions ?? [];

  if (!first) {
    return <ReviewScreen permissions={permissions} role={role} staff={staff} t={t} />;
  }

  let request;
  try {
    request = await apiGet(`/api/v1/requests/${first.id}`);
  } catch (err) {
    if (err?.digest) throw err;
    return <FailureScreen view={await errorViewFor(err)} {...(await failureContext())} />;
  }

  const [history, documents] = await Promise.all([
    tryGet(`/api/v1/requests/${first.id}/history`, []),
    tryGet(`/api/v1/requests/${first.id}/documents`, []),
  ]);

  return (
    <ReviewScreen
      backTo={`/staff/review/${first.id}`}
      documents={itemsOf(documents)}
      history={itemsOf(history)}
      permissions={permissions}
      request={request}
      role={role}
      staff={staff}
      t={t}
    />
  );
}
