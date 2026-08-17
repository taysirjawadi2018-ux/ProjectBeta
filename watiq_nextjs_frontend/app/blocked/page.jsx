import BlockedScreen from '@/components/BlockedScreen.jsx';
import { TITLES, FORBIDDEN_VIEW } from '@/lib/error-views.js';
import { pageTitle } from '@/lib/metadata.js';
import { failureContext } from '@/lib/failure.js';

/**
 * The access-denied screen as a route, for the cases that arrive by redirect
 * rather than by a caught exception — nginx bouncing a rate-limited request,
 * or a guard that wants to hand the citizen a URL they can reload and quote.
 *
 * ?code= and ?reason= are both validated against closed sets. An unrecognised
 * status, or a reason code that is not one of ours, falls back rather than
 * being rendered: the query string is attacker-controlled and this screen is
 * exactly the one someone would want to forge.
 */

export const generateMetadata = pageTitle('Access Restricted');

const ALLOWED_CODES = [401, 403, 429];

const REASONS = {
  forbidden: FORBIDDEN_VIEW.message,
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  session_expired: 'Your session has expired. Please sign in again.',
};

export default async function BlockedPage({ searchParams }) {
  const query = await searchParams;

  const raw = Number.parseInt(query?.code ?? '', 10);
  const code = ALLOWED_CODES.includes(raw) ? raw : 403;
  const { now, reference } = await failureContext();

  return (
    <BlockedScreen
      code={code}
      title={TITLES[code] ?? 'Access denied'}
      message={REASONS[String(query?.reason ?? '')] ?? FORBIDDEN_VIEW.message}
      now={now}
      reference={reference}
    />
  );
}
