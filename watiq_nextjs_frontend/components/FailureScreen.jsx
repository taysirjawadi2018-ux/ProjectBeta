import ErrorScreen from './ErrorScreen.jsx';
import BlockedScreen from './BlockedScreen.jsx';
import MaintenanceScreen from './MaintenanceScreen.jsx';

/**
 * Picks the screen a failure lands on, from the `design` that
 * lib/errors.js#errorViewFor decided.
 *
 * This is the dispatch that lived at the top of
 * frontend_flask/templates/error.html, where the status chose which parent
 * template to extend. Having it in one place is what stops a screen from
 * quietly rendering a 429 as a generic "something went wrong" — the citizen
 * needs the reference and timestamp, not an apology.
 *
 * Every page that calls the API catches ApiError and renders this rather than
 * letting the throw reach app/error.js, because Next strips a server error's
 * detail before the boundary sees it.
 */
export default function FailureScreen({ view, now, reference }) {
  if (view.design === 'blocked') {
    return <BlockedScreen {...view} now={now} reference={reference} />;
  }
  if (view.design === 'maintenance') {
    return <MaintenanceScreen {...view} />;
  }
  return <ErrorScreen {...view} reference={reference} />;
}
