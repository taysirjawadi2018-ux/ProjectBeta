import { apiGet, tryGet } from '@/lib/api.js';
import { pageTitle } from '@/lib/metadata.js';
import { itemsOf } from '@/lib/format.js';
import { requireStaff } from '@/lib/guards.js';
import { getTranslator } from '@/lib/i18n.js';
import { role as sessionRole } from '@/lib/auth.js';
import { errorViewFor } from '@/lib/errors.js';
import { failureContext } from '@/lib/failure.js';
import ReviewScreen from '@/components/ReviewScreen.jsx';
import FailureScreen from '@/components/FailureScreen.jsx';
import '@/styles/pages/verify_request.css';

/** A deep-linked request. Port of views/staff.py:review with a request_id. */

export const generateMetadata = pageTitle('Review', { suffix: '| Watiq Back Office' });

export default async function ReviewPage({ params }) {
  const { id } = await params;
  await requireStaff(`/staff/review/${id}`);
  const t = await getTranslator();
  const role = await sessionRole();

  const [staff, permissionsData] = await Promise.all([
    tryGet('/api/v1/staff/me', null),
    tryGet('/api/v1/staff/me/permissions', {}),
  ]);

  let request;
  try {
    request = await apiGet(`/api/v1/requests/${id}`);
  } catch (err) {
    if (err?.digest) throw err;
    return <FailureScreen view={await errorViewFor(err)} {...(await failureContext())} />;
  }

  const [history, documents] = await Promise.all([
    tryGet(`/api/v1/requests/${id}/history`, []),
    tryGet(`/api/v1/requests/${id}/documents`, []),
  ]);

  return (
    <ReviewScreen
      backTo={`/staff/review/${id}`}
      documents={itemsOf(documents)}
      history={itemsOf(history)}
      permissions={permissionsData?.permissions ?? []}
      request={request}
      role={role}
      staff={staff}
      t={t}
    />
  );
}
