import { assertStoreReachable } from '@/lib/session.js';
import { apiRequest } from '@/lib/api.js';

/**
 * Readiness: may this replica take traffic?
 *
 * Both dependencies are checked because without either one the BFF cannot do
 * its job. No Redis means no server-side session, and outside dev that must be
 * a hard failure rather than a silent downgrade to a cookie-backed session —
 * which would put the access token in the browser, the exact thing the BFF
 * exists to prevent (ADR-005).
 *
 * 503 rather than 500 so the orchestrator drains this replica instead of
 * restarting it: a slow API is not a reason to cycle the frontend.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks = {};

  try {
    await assertStoreReachable();
    checks.session_store = 'ok';
  } catch (err) {
    checks.session_store = `unavailable: ${err.message}`;
  }

  try {
    await apiRequest('GET', '/healthz', { auth: false, retryAuth: false });
    checks.api = 'ok';
  } catch (err) {
    checks.api = `unavailable: ${err.message}`;
  }

  const ready = Object.values(checks).every((value) => value === 'ok');
  return Response.json(
    { status: ready ? 'ready' : 'degraded', checks },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
