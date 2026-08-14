import ErrorScreen from '@/components/ErrorScreen.jsx';
import { NOT_FOUND_VIEW } from '@/lib/error-views.js';

/**
 * Reached both by a URL that was never routed and by every guard that refuses
 * an unauthorised visitor with notFound(). The wording covers both on purpose —
 * "or you do not have access to it" is what keeps a staff route from confirming
 * its own existence to a citizen who guessed the path.
 */
export default function NotFound() {
  return <ErrorScreen {...NOT_FOUND_VIEW} />;
}
