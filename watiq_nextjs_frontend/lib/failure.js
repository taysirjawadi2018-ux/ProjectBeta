import 'server-only';
import { headers } from 'next/headers';

/**
 * The two per-request values the blocked screen shows, resolved on the server.
 *
 * Both have to be server-rendered. The timestamp is what someone quotes when
 * asking for a block to be reviewed, so it must be correct before — and
 * without — JavaScript; a client clock would also report the reader's timezone
 * rather than the one the audit log uses. The reference ties the screen to the
 * request in that log.
 */
export async function failureContext() {
  const requestId = (await headers()).get('x-request-id');
  return {
    // The format frontend_flask/app.py used for `now_utc`.
    now: `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
    // Set by nginx. Absent in dev, where the Flask template printed the same
    // placeholder rather than an empty gap.
    reference: requestId?.slice(0, 8) || 'UNKNOWN',
  };
}
