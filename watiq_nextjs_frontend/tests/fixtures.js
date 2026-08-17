/**
 * Representative payloads shaped like the API's response models
 * (backend/app/modules/(star)/schemas.py).
 *
 * Ported field-for-field from frontend_flask/tests/conftest.py. Do not
 * paraphrase these: the distinctions recorded in the comments below
 * (`unread_count` not `count`, `role_code`, office_service `id` vs
 * `catalog_id`) are exactly what the contract tests exist to catch, and a
 * "tidied up" payload silently stops catching them.
 */
export const FIXTURES = {
  'GET /api/v1/auth/me': {
    id: 1,
    national_id: '12345678',
    first_name: 'Amal',
    last_name: 'Ben Salah',
    email: 'amal@example.tn',
  },
  // StaffMeOut has a single `name` column, unlike the citizen profile —
  // see backend/app/modules/staff/repository.py _GET_ME.
  'GET /api/v1/staff/me': {
    id: 7,
    name: 'Karim Trabelsi',
    email: 'karim@watiq.tn',
    office_id: 1,
    office_name: 'Tunis Municipality',
    role_code: 'admin',
    role_name: 'Administrator',
    is_active: true,
  },
  'GET /api/v1/staff/me/permissions': { permissions: ['request.review', 'request.assign'] },
  'GET /api/v1/catalog/services': [
    {
      id: 1, code: 'civil.birth_certificate', slug: 'birth-certificate',
      name: 'Birth Certificate', name_fr: 'Acte de naissance',
      description: 'Official copy of a birth record.', description_fr: null,
      base_fee: 5.0, currency: 'TND', processing_time: 3, is_digital: true,
      legal_reference: null, office_type: 'municipality',
      category_id: 1, category_code: 'civil',
    },
  ],
  'GET /api/v1/catalog/categories': [{ id: 1, code: 'civil', name: 'Civil Status' }],
  'GET /api/v1/catalog/offices': [
    {
      id: 1, name: 'Tunis Municipality', name_fr: 'Municipalité de Tunis',
      type: 'municipality', governorate: 'Tunis', city: 'Tunis',
      address: 'Place de la Kasbah', phone: '+216 71 000 000',
      email: null, latitude: null, longitude: null, opening_hours: null,
    },
  ],
  // OfficeServiceOut: `id` is the office_service_id a request or an
  // appointment is filed against, and `catalog_id` points back at the service.
  'GET /api/v1/catalog/offices/1/services': [
    {
      id: 31, office_id: 1, catalog_id: 1, is_available: true,
      fee_override: null, processing_time_override: null, notes: null,
      code: 'civil.birth_certificate', slug: 'birth-certificate',
      name: 'Birth Certificate', name_fr: 'Acte de naissance',
      description: null, base_fee: 5.0, currency: 'TND',
      processing_time: 3, is_digital: true,
    },
  ],
  'GET /api/v1/requests': {
    items: [
      {
        id: 11, tracking_code: 'WTQ-2026-000011', office_service_id: 1,
        office_id: 1, status_id: 2, status_name: 'Under review',
        priority_id: null, assigned_staff_id: null, assigned_at: null,
        form_data: { full_name: 'Amal Ben Salah' },
        submitted_at: '2026-07-30T09:12:00Z', estimated_ready_date: '2026-08-05',
        service_name: 'Birth Certificate',
      },
    ],
    total: 1,
  },
  'GET /api/v1/requests/11': {
    id: 11, tracking_code: 'WTQ-2026-000011', office_service_id: 1,
    office_id: 1, status_id: 2, status_name: 'Under review',
    priority_id: null, assigned_staff_id: null, assigned_at: null,
    form_data: { full_name: 'Amal Ben Salah', place_of_birth: 'Tunis' },
    submitted_at: '2026-07-30T09:12:00Z', estimated_ready_date: '2026-08-05',
    service_name: 'Birth Certificate',
  },
  'GET /api/v1/requests/11/history': [
    { status_name: 'Submitted', changed_at: '2026-07-30T09:12:00Z', note: null },
  ],
  // DocumentOut carries no URL on purpose — the storage key never crosses the
  // boundary, so downloads go through GET /documents/{id}/download.
  'GET /api/v1/requests/11/documents': [
    {
      id: 3, document_type: 'National ID scan', mime_type: 'application/pdf',
      file_size_bytes: 245760, status: 'pending',
      uploaded_at: '2026-07-30T09:12:30Z', verified_at: null,
    },
  ],
  'GET /api/v1/documents/3/download': { presigned_url: 'https://storage.example/d/3' },
  'GET /api/v1/requests/office/queue': {
    items: [
      {
        id: 11, tracking_code: 'WTQ-2026-000011', status_name: 'Under review',
        office_service_id: 1, office_id: 1, status_id: 2,
        priority_id: null, assigned_staff_id: null, assigned_at: null,
        form_data: {}, submitted_at: '2026-07-30T09:12:00Z',
        estimated_ready_date: null, service_name: 'Birth Certificate',
      },
    ],
    total: 1,
  },
  'GET /api/v1/requests/track/WTQ-2026-000011': {
    tracking_code: 'WTQ-2026-000011', status_name: 'Under review',
    submitted_at: '2026-07-30T09:12:00Z', estimated_ready_date: '2026-08-05',
    service_name: 'Birth Certificate', office_name: 'Tunis Municipality',
  },
  'GET /api/v1/appointments': {
    items: [
      {
        id: 4, office_name: 'Tunis Municipality', slot_date: '2026-08-10',
        time_slot: '09:00–09:30', status: 'booked',
        service_name: 'Birth Certificate',
      },
    ],
    total: 1,
  },
  'GET /api/v1/appointments/slots': [
    {
      // office_service_id points at the office_services row (id 31), not
      // at the catalogue service — same key the booking payload carries.
      id: 21, office_id: 1, office_name: 'Tunis Municipality',
      governorate: 'Tunis', office_service_id: 31, slot_date: '2026-08-10',
      time_slot: '09:00–09:30', capacity: 4, booked_count: 1, seats_left: 3,
    },
  ],
  'GET /api/v1/appointments/office': [
    {
      id: 4, slot_date: '2026-08-10', time_slot: '09:00–09:30',
      status: 'booked', service_name: 'Birth Certificate',
    },
  ],
  // Cursor-paginated, with no total — see NotificationListOut.
  'GET /api/v1/notifications': {
    items: [
      {
        id: 5, type: 'request_update', title: 'Your request was received',
        message: 'We have your birth certificate request.',
        is_read: false, request_id: 11, sent_via: 'in_app',
        created_at: '2026-07-30T09:13:00Z',
      },
    ],
    next_cursor: 'eyJpZCI6NX0',
    unread_count: 2,
  },
  'GET /api/v1/notifications/unread-count': { unread_count: 2 },
  'GET /api/v1/payments': {
    items: [
      {
        id: 9, amount: 5.0, currency: 'TND', status: 'completed',
        paid_at: '2026-07-30T09:20:00Z', service_name: 'Birth Certificate',
      },
    ],
    total: 1,
  },
  'GET /api/v1/payments/9': {
    id: 9, amount: 5.0, currency: 'TND', status: 'completed',
    paid_at: '2026-07-30T09:20:00Z', service_name: 'Birth Certificate',
  },
  'GET /api/v1/admin/users': {
    items: [
      {
        id: 1, first_name: 'Amal', last_name: 'Ben Salah',
        national_id: '12345678', is_active: true,
      },
      {
        id: 2, first_name: 'Sami', last_name: 'Gharbi',
        national_id: '87654321', is_active: false,
      },
    ],
    total: 2,
  },
  'GET /api/v1/admin/staff': [
    {
      id: 7, first_name: 'Karim', last_name: 'Trabelsi',
      role_name: 'Administrator', role_code: 'admin',
      office_name: 'Tunis Municipality', is_active: true,
    },
  ],
  'GET /api/v1/admin/roles': [
    {
      id: 1, code: 'clerk', name: 'Clerk',
      description: 'Processes citizen requests.', permissions: ['request.review'],
    },
  ],
  'GET /api/v1/admin/permissions': [
    { code: 'request.review', description: 'Review submitted requests' },
    { code: 'request.assign', description: 'Assign requests to staff' },
  ],
};

/** A deep copy, so a test that mutates what it asserts on cannot leak into the next. */
export function fixtureJson(key) {
  return structuredClone(FIXTURES[key]);
}
