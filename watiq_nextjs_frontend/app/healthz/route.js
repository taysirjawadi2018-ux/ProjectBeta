/**
 * Liveness. Answers as long as this process can serve a request — deliberately
 * probes nothing, because a liveness check that fails when a dependency is down
 * gets the container restarted for someone else's outage.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
