import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { isAuthenticated, isStaff, role } from './auth.js';

/**
 * Route guards. Port of frontend_flask/auth.py:122-166, semantics verbatim.
 *
 * The 404s are not a shortcut. A citizen has no business learning that a staff
 * route exists at all, so an authenticated-but-unauthorised visitor gets the
 * same response as one asking for a URL that was never routed — which is the
 * same reasoning that makes the API return 404 on BOLA (Security.md §7.3).
 *
 * These run while rendering a Server Component, where cookies are read-only.
 * That is why the sign-in redirect carries a fixed ?notice= code rather than
 * writing a flash message: flash() has to write the session, and issuing the
 * session cookie from a render throws. A fixed code is also the only form safe
 * to put in a URL — free text there is reflected content and untranslatable.
 */

const ADMIN_ROLES = ['admin', 'director'];

function toSignIn(nextPath, { staff = false } = {}) {
  const params = new URLSearchParams();
  if (staff) params.set('staff', '1');
  if (nextPath) params.set('next', nextPath);
  params.set('notice', 'signin_required');
  redirect(`/login?${params.toString()}`);
}

export async function requireLogin(nextPath) {
  if (!(await isAuthenticated())) toSignIn(nextPath);
}

export async function requireStaff(nextPath) {
  if (!(await isAuthenticated())) toSignIn(nextPath, { staff: true });
  if (!(await isStaff())) notFound();
}

export async function requireAdmin(nextPath) {
  await requireStaff(nextPath);
  if (!ADMIN_ROLES.includes(await role())) notFound();
}
