/**
 * Which screen a failure lands on, as plain data.
 *
 * Deliberately NOT server-only: app/error.js is a client component (React
 * requires error boundaries to be), and it needs these constants. The half that
 * touches the session lives in lib/errors.js, which is server-only and
 * re-exports everything here so server callers have one import.
 *
 * One error template, three designs. The redesign supplied dedicated screens
 * for two failure modes — a security lockout and a maintenance window — so the
 * status decides which one renders rather than every failure landing on the
 * same generic page (frontend_flask/templates/error.html):
 *
 *   401 / 403 / 429   the "access restricted" design. It carries the session
 *                     reference and timestamp someone has to quote when asking
 *                     for the block to be reviewed.
 *   502 / 503 / 504   the "maintenance" design.
 *   everything else   the generic page, which keeps 404 plain.
 */

export const BLOCKED_STATUSES = [401, 403, 429];
export const MAINTENANCE_STATUSES = [502, 503, 504];

/** Verbatim from frontend_flask/app.py:_TITLES. */
export const TITLES = {
  401: 'Session expired',
  403: 'Access Restricted',
  404: 'Page not found',
  409: 'Conflict',
  429: 'Too many requests',
  502: 'Service error',
  503: 'Service unavailable',
};

export function designFor(code) {
  if (BLOCKED_STATUSES.includes(code)) return 'blocked';
  if (MAINTENANCE_STATUSES.includes(code)) return 'maintenance';
  return 'generic';
}

/** The 403 a guard raises itself, rather than one the API returned. */
export const FORBIDDEN_VIEW = {
  code: 403,
  title: TITLES[403],
  message:
    'This account does not hold the clearance required for that area of the portal. ' +
    'The attempt has been recorded.',
  design: 'blocked',
};

export const NOT_FOUND_VIEW = {
  code: 404,
  title: TITLES[404],
  message: 'That page does not exist, or you do not have access to it.',
  design: 'generic',
};

export const SERVER_ERROR_VIEW = {
  code: 500,
  title: 'Something went wrong',
  message: 'An unexpected error occurred. The incident has been logged.',
  design: 'generic',
};

export const UNREACHABLE_VIEW = {
  code: 503,
  title: TITLES[503],
  message:
    'The portal cannot reach the records service right now. Please try again in a few minutes.',
  design: 'maintenance',
};
