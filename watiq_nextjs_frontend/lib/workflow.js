/**
 * Workflow vocabulary shared by the staff screens and the actions behind them.
 *
 * Separate from lib/actions.js because a 'use server' module may only export
 * async functions — a plain constant there is a build error.
 *
 * PATCH /requests/{id}/status takes StatusUpdateIn{new_status_code, reason} and
 * forbids extra keys, so it wants the *code* from request_statuses, not the
 * lookup id. These three are the decisions the review screen offers; the codes
 * are the ones seeded in Watiq.sql. Surfaced rather than hardcoded in markup so
 * the buttons and the validation cannot drift apart.
 */
export const STATUS_CODES = {
  approved: 'approved',
  rejected: 'rejected',
  resubmission: 'pending_docs',
};

/** AppointmentStatusIn accepts exactly these two. */
export const APPOINTMENT_STATUSES = ['completed', 'no_show'];
