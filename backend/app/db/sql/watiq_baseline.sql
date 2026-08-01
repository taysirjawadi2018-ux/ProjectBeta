-- ============================================================
-- WATIQ DATABASE SCHEMA
-- A single national portal for Tunisia's public legal services
-- Target: PostgreSQL 15+
--
-- Why 15+: the reporting views declare WITH (security_invoker = true).
-- Without it a view runs as its owner and silently bypasses every row-level
-- security policy below, which turns any granted view into a full data leak.
-- PostgreSQL 13 is already end-of-life, so this is not a real constraint.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), gen_random_bytes()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy service search for the national catalogue

-- ============================================================
-- 0. SHARED HELPERS
-- ============================================================

-- Keeps updated_at honest instead of relying on every code path to set it.
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- Session context accessors used by the RLS policies in section 7.
-- current_setting(..., TRUE) returns NULL when unset, so an unauthenticated
-- connection matches no rows instead of raising.
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS INTEGER
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::INTEGER;
$$;

CREATE OR REPLACE FUNCTION app_current_staff_id() RETURNS INTEGER
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_staff_id', TRUE), '')::INTEGER;
$$;

CREATE OR REPLACE FUNCTION app_current_office_id() RETURNS INTEGER
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_office_id', TRUE), '')::INTEGER;
$$;

-- Masks an identifier down to its last 4 characters (e.g. '12345678' -> '****5678').
CREATE OR REPLACE FUNCTION fn_mask_tail(p_value TEXT, p_keep INTEGER DEFAULT 4)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN p_value IS NULL THEN NULL
        WHEN length(p_value) <= p_keep THEN repeat('*', length(p_value))
        ELSE repeat('*', length(p_value) - p_keep) || right(p_value, p_keep)
    END;
$$;

-- ============================================================
-- 1. ACCESS CONTROL (RBAC)
-- ============================================================

-- Staff roles. Adding a role is an INSERT, not a migration.
CREATE TABLE roles (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    name_fr         VARCHAR(100),
    description     TEXT,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_roles_code UNIQUE (code)
);

COMMENT ON TABLE roles IS 'Staff roles (clerk, supervisor, director, national_auditor, admin)';

-- Discrete capabilities a role can be granted.
CREATE TABLE permissions (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(100) NOT NULL,      -- e.g. 'request.approve'
    name            VARCHAR(255) NOT NULL,
    description     TEXT,

    CONSTRAINT uq_permissions_code UNIQUE (code)
);

COMMENT ON TABLE permissions IS 'Atomic capabilities; enforced both in app code and in RLS policies';

CREATE TABLE role_permissions (
    role_id         INTEGER NOT NULL,
    permission_id   INTEGER NOT NULL,
    granted_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id) REFERENCES permissions(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

COMMENT ON TABLE role_permissions IS 'Which permissions each role holds';
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);
-- fn_staff_has_permission() lives in section 3, after the staff table exists.

-- ============================================================
-- 2. REFERENCE / LOOKUP TABLES
-- ============================================================

-- Categories of government services
CREATE TABLE categories (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    name_fr         VARCHAR(255),           -- French localization
    icon            VARCHAR(255),           -- Icon URL or class name
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_categories_code UNIQUE (code)
);

COMMENT ON TABLE categories IS 'Service categories (e.g., Civil Status, Tax, Administration)';
CREATE INDEX idx_categories_sort_order ON categories(sort_order);

-- Government offices / agencies
CREATE TABLE offices (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    name_fr         VARCHAR(255),
    type            VARCHAR(100) NOT NULL,  -- e.g., 'municipality', 'tax_office', 'court'
    governorate     VARCHAR(100) NOT NULL,
    city            VARCHAR(100) NOT NULL,
    address         TEXT,
    phone           VARCHAR(20),
    email           VARCHAR(255),
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    opening_hours   JSONB,                  -- Flexible schedule storage
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ,

    CONSTRAINT uq_offices_name_governorate UNIQUE (name, governorate, city),
    CONSTRAINT chk_offices_phone CHECK (phone IS NULL OR phone ~ '^\+216[0-9]{8}$')
);

COMMENT ON TABLE offices IS 'Government offices where citizens submit requests';
CREATE INDEX idx_offices_governorate ON offices(governorate);
CREATE INDEX idx_offices_city ON offices(city);
CREATE INDEX idx_offices_type ON offices(type);
CREATE INDEX idx_offices_is_active ON offices(is_active);
CREATE INDEX idx_offices_location ON offices(latitude, longitude);
-- "Find the nearest office that does X" starts with a fuzzy name match.
CREATE INDEX idx_offices_name_trgm ON offices USING GIN (name gin_trgm_ops);

CREATE TRIGGER trg_offices_updated_at BEFORE UPDATE ON offices
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Priority levels for requests
CREATE TABLE priorities (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    name_fr         VARCHAR(100),
    sort_order      INTEGER DEFAULT 0,

    CONSTRAINT uq_priorities_code UNIQUE (code)
);

COMMENT ON TABLE priorities IS 'Request priority levels (e.g., normal, urgent, emergency)';
CREATE INDEX idx_priorities_sort_order ON priorities(sort_order);

-- Request status definitions
CREATE TABLE request_statuses (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    name_fr         VARCHAR(100),
    color           VARCHAR(7) DEFAULT '#6B7280',  -- Hex color for UI
    sort_order      INTEGER DEFAULT 0,
    is_final        BOOLEAN NOT NULL DEFAULT FALSE, -- Terminal status (completed/rejected)

    CONSTRAINT uq_request_statuses_code UNIQUE (code),
    CONSTRAINT chk_request_statuses_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

COMMENT ON TABLE request_statuses IS 'Workflow statuses for requests (submitted, under_review, completed, etc.)';
CREATE INDEX idx_request_statuses_sort_order ON request_statuses(sort_order);
CREATE INDEX idx_request_statuses_is_final ON request_statuses(is_final);

-- Payment types (fees, fines, taxes)
CREATE TABLE payment_types (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    name_fr         VARCHAR(255),

    CONSTRAINT uq_payment_types_code UNIQUE (code)
);

COMMENT ON TABLE payment_types IS 'Types of payments (service_fee, fine, stamp_duty, etc.)';

-- Payment methods
CREATE TABLE payment_methods (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(100) NOT NULL,
    name_fr         VARCHAR(100),

    CONSTRAINT uq_payment_methods_code UNIQUE (code)
);

COMMENT ON TABLE payment_methods IS 'Available payment channels (bank_transfer, e-dinar, cash, etc.)';

-- ============================================================
-- 3. CORE ENTITY TABLES
-- ============================================================

-- Registered citizens
CREATE TABLE users (
    id                      SERIAL PRIMARY KEY,
    national_id             VARCHAR(20),                    -- Tunisian CIN, 8 digits. NULL only after anonymization.
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    email                   VARCHAR(255),
    phone                   VARCHAR(20),
    password_hash           VARCHAR(255),                   -- For citizen portal login
    date_of_birth           DATE,
    governorate             VARCHAR(100),
    city                    VARCHAR(100),
    address                 TEXT,
    email_verified          BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified          BOOLEAN NOT NULL DEFAULT FALSE,

    -- Account lifecycle: suspend without destroying the audit trail.
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    deactivated_at          TIMESTAMPTZ,
    deactivation_reason     TEXT,

    -- Right-to-erasure: PII is nulled, the row survives for record-keeping.
    anonymized_at           TIMESTAMPTZ,
    anonymization_reason    TEXT,

    -- Brute-force protection
    failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ,

    created_at              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ,

    CONSTRAINT uq_users_national_id UNIQUE (national_id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_phone UNIQUE (phone),
    CONSTRAINT chk_users_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    -- Tunisian CIN: exactly 8 digits.
    CONSTRAINT chk_users_national_id_format CHECK (national_id ~ '^[0-9]{8}$'),
    -- Tunisian MSISDN in E.164: +216 followed by 8 digits.
    CONSTRAINT chk_users_phone_format CHECK (phone ~ '^\+216[0-9]{8}$'),
    -- national_id may only be absent on an anonymized record.
    CONSTRAINT chk_users_national_id_required
        CHECK (national_id IS NOT NULL OR anonymized_at IS NOT NULL),
    CONSTRAINT chk_users_date_of_birth CHECK (date_of_birth <= CURRENT_DATE),
    CONSTRAINT chk_users_failed_logins CHECK (failed_login_attempts >= 0)
);

COMMENT ON TABLE users IS 'Citizens registered in the Watiq portal';
COMMENT ON COLUMN users.anonymized_at IS 'Set by fn_anonymize_user(); PII is stripped but the row is retained for audit';
-- No standalone index on national_id / email / phone: the UNIQUE constraints already provide one.
CREATE INDEX idx_users_governorate ON users(governorate);
CREATE INDEX idx_users_is_active ON users(is_active);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Government staff / civil servants
CREATE TABLE staff (
    id                      SERIAL PRIMARY KEY,
    office_id               INTEGER NOT NULL,
    role_id                 INTEGER NOT NULL,
    name                    VARCHAR(255) NOT NULL,
    email                   VARCHAR(255) NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,

    -- MFA. Staff can read citizens' CIN, address and ID scans, so a password
    -- alone is not an acceptable authenticator here.
    mfa_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret              VARCHAR(255),                   -- TOTP seed, encrypted by the app before storage
    mfa_enrolled_at         TIMESTAMPTZ,

    -- Brute-force protection
    failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ,

    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ,

    CONSTRAINT fk_staff_office
        FOREIGN KEY (office_id) REFERENCES offices(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_staff_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_staff_email UNIQUE (email),
    CONSTRAINT chk_staff_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_staff_mfa_secret_present
        CHECK (mfa_enabled = FALSE OR mfa_secret IS NOT NULL),
    CONSTRAINT chk_staff_failed_logins CHECK (failed_login_attempts >= 0)
);

COMMENT ON TABLE staff IS 'Government employees who process requests';
COMMENT ON COLUMN staff.mfa_secret IS 'TOTP shared secret; MUST be encrypted application-side before insert';
CREATE INDEX idx_staff_office_id ON staff(office_id);
CREATE INDEX idx_staff_role_id ON staff(role_id);
CREATE INDEX idx_staff_is_active ON staff(is_active);

CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON staff
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Permission check used by application code AND by the RLS policies below.
--
-- SECURITY DEFINER on purpose: the RLS policy on `staff` restricts a staff
-- connection to its own office, which would make this function return a wrong
-- answer (or no answer) depending on who asks. It must see the whole staff
-- table to answer honestly. It returns only a boolean, so it leaks nothing.
CREATE OR REPLACE FUNCTION fn_staff_has_permission(p_staff_id INTEGER, p_permission_code VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM staff s
        JOIN role_permissions rp ON rp.role_id = s.role_id
        JOIN permissions p       ON p.id = rp.permission_id
        WHERE s.id = p_staff_id
          AND s.is_active = TRUE
          AND p.code = p_permission_code
    );
$$;

COMMENT ON FUNCTION fn_staff_has_permission IS 'Authoritative RBAC check; consulted by RLS policies on requests and payments';

-- One-time MFA recovery codes. Without these, a lost phone means a manual
-- (and socially engineerable) reset by an administrator.
CREATE TABLE staff_recovery_codes (
    id              SERIAL PRIMARY KEY,
    staff_id        INTEGER NOT NULL,
    code_hash       VARCHAR(255) NOT NULL,      -- hash only, never the plaintext code
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_staff_recovery_codes_staff
        FOREIGN KEY (staff_id) REFERENCES staff(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

COMMENT ON TABLE staff_recovery_codes IS 'Single-use MFA recovery codes (hashed)';
CREATE INDEX idx_staff_recovery_codes_staff_id ON staff_recovery_codes(staff_id) WHERE used_at IS NULL;

-- ---------------------------------------------------------------
-- THE NATIONAL SERVICE CATALOGUE
--
-- Split deliberately in two:
--
--   service_catalog  - one row per service that exists in the country. Name,
--                      legal requirements, statutory fee and SLA live here
--                      because Tunisian law defines them nationally; an office
--                      does not invent its own birth-certificate requirements.
--   office_services  - which offices actually deliver each catalogue entry,
--                      plus the narrow local variations that are permitted.
--
-- Keeping these in one table would mean ~350 copies of "Acte de naissance",
-- 350 slugs (so no clean /services/acte-de-naissance URL), 350 fee values free
-- to drift apart, and a search page that returns the same service 350 times.
-- ---------------------------------------------------------------

CREATE TABLE service_catalog (
    id                  SERIAL PRIMARY KEY,
    code                VARCHAR(100) NOT NULL,      -- stable machine key, e.g. 'civil.birth_certificate'
    slug                VARCHAR(255) NOT NULL,      -- clean national URL, unique across the country
    category_id         INTEGER,
    name                VARCHAR(255) NOT NULL,      -- Arabic
    name_fr             VARCHAR(255),
    description         TEXT,
    description_fr      TEXT,
    required_documents  JSONB,                      -- national legal requirement
    base_fee            DECIMAL(12, 3),             -- statutory fee; NULL = free
    currency            VARCHAR(3) NOT NULL DEFAULT 'TND',
    processing_time     INTEGER,                    -- national SLA, in days
    is_digital          BOOLEAN NOT NULL DEFAULT FALSE, -- completable fully online
    legal_reference     TEXT,                       -- the decree or law defining it
    office_type         VARCHAR(100),               -- kind of office that delivers it
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ,

    -- 'simple' rather than 'french': the catalogue mixes Arabic and French, and
    -- no single stemmer covers both. pg_trgm below handles typo tolerance.
    search_document     tsvector GENERATED ALWAYS AS (
        to_tsvector('simple'::regconfig,
            coalesce(name, '') || ' ' || coalesce(name_fr, '') || ' ' ||
            coalesce(description, '') || ' ' || coalesce(description_fr, ''))
    ) STORED,

    CONSTRAINT fk_service_catalog_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT uq_service_catalog_code UNIQUE (code),
    CONSTRAINT uq_service_catalog_slug UNIQUE (slug),
    CONSTRAINT chk_service_catalog_processing_time
        CHECK (processing_time IS NULL OR processing_time >= 0),
    CONSTRAINT chk_service_catalog_base_fee CHECK (base_fee IS NULL OR base_fee >= 0),
    CONSTRAINT chk_service_catalog_currency CHECK (currency ~ '^[A-Z]{3}$')
);

COMMENT ON TABLE service_catalog IS 'One row per service that exists nationally; the thing citizens search';
COMMENT ON COLUMN service_catalog.base_fee IS 'Statutory fee. office_services.fee_override only where law permits a local variation.';
CREATE INDEX idx_service_catalog_category ON service_catalog(category_id);
CREATE INDEX idx_service_catalog_is_active ON service_catalog(is_active);
CREATE INDEX idx_service_catalog_is_digital ON service_catalog(is_digital);
CREATE INDEX idx_service_catalog_office_type ON service_catalog(office_type);
-- National discovery: full-text for real queries, trigram for typo tolerance.
CREATE INDEX idx_service_catalog_search ON service_catalog USING GIN (search_document);
CREATE INDEX idx_service_catalog_name_trgm ON service_catalog USING GIN (name gin_trgm_ops);
CREATE INDEX idx_service_catalog_name_fr_trgm ON service_catalog USING GIN (name_fr gin_trgm_ops);

CREATE TRIGGER trg_service_catalog_updated_at BEFORE UPDATE ON service_catalog
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Which office delivers which catalogue entry. This is what a request or an
-- appointment actually points at, because "a birth certificate" is not
-- actionable until you say which office is issuing it.
CREATE TABLE office_services (
    id                          SERIAL PRIMARY KEY,
    office_id                   INTEGER NOT NULL,
    catalog_id                  INTEGER NOT NULL,
    is_available                BOOLEAN NOT NULL DEFAULT TRUE,
    processing_time_override    INTEGER,            -- this office is slower or faster than the SLA
    fee_override                DECIMAL(12, 3),     -- rare; only where law permits
    notes                       TEXT,               -- e.g. 'mornings only'
    created_at                  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMPTZ,

    CONSTRAINT fk_office_services_office
        FOREIGN KEY (office_id) REFERENCES offices(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_office_services_catalog
        FOREIGN KEY (catalog_id) REFERENCES service_catalog(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_office_services UNIQUE (office_id, catalog_id),
    -- Referenced by the composite FKs on requests, appointment_slots and
    -- appointments. That is what stops a request being filed against an office
    -- which does not offer the service. Without this UNIQUE they cannot exist.
    CONSTRAINT uq_office_services_id_office UNIQUE (id, office_id),
    CONSTRAINT chk_office_services_processing_time
        CHECK (processing_time_override IS NULL OR processing_time_override >= 0),
    CONSTRAINT chk_office_services_fee CHECK (fee_override IS NULL OR fee_override >= 0)
);

COMMENT ON TABLE office_services IS 'Availability of each catalogue service per office, with permitted local overrides';
CREATE INDEX idx_office_services_office_id ON office_services(office_id);
CREATE INDEX idx_office_services_catalog_id ON office_services(catalog_id);
CREATE INDEX idx_office_services_available
    ON office_services(catalog_id, office_id) WHERE is_available = TRUE;

CREATE TRIGGER trg_office_services_updated_at BEFORE UPDATE ON office_services
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- 4. AUTHENTICATION & SESSION MANAGEMENT
-- ============================================================

-- Active sessions / devices for both citizens and staff.
-- Revoking a departing employee's access is an UPDATE here, not a password reset.
CREATE TABLE sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             INTEGER,
    staff_id            INTEGER,
    refresh_token_hash  VARCHAR(255) NOT NULL,      -- SHA-256 of the refresh token, never the token
    device_label        VARCHAR(255),               -- e.g. 'Chrome on Windows'
    ip_address          INET,
    user_agent          TEXT,
    mfa_satisfied       BOOLEAN NOT NULL DEFAULT FALSE,
    issued_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ,
    revoked_reason      VARCHAR(100),               -- 'logout', 'admin_revoke', 'offboarding', 'password_change'

    CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_sessions_staff
        FOREIGN KEY (staff_id) REFERENCES staff(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_sessions_refresh_token UNIQUE (refresh_token_hash),
    -- Exactly one principal per session.
    CONSTRAINT chk_sessions_one_principal
        CHECK ((user_id IS NOT NULL)::int + (staff_id IS NOT NULL)::int = 1),
    CONSTRAINT chk_sessions_expiry CHECK (expires_at > issued_at)
);

COMMENT ON TABLE sessions IS 'Active refresh-token sessions for citizens and staff; revoke here to cut access';
CREATE INDEX idx_sessions_user_id ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_staff_id ON sessions(staff_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- OTP / verification codes: email confirmation, phone confirmation,
-- password reset, and step-up MFA challenges.
CREATE TABLE verification_codes (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER,
    staff_id        INTEGER,
    purpose         VARCHAR(50) NOT NULL,       -- 'email_verify','phone_verify','password_reset','login_mfa'
    channel         VARCHAR(20) NOT NULL,       -- 'email','sms'
    destination     VARCHAR(255) NOT NULL,      -- address the code was actually sent to
    code_hash       VARCHAR(255) NOT NULL,      -- hash of the OTP, never the OTP itself
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 5,
    expires_at      TIMESTAMPTZ NOT NULL,
    consumed_at     TIMESTAMPTZ,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_verification_codes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_verification_codes_staff
        FOREIGN KEY (staff_id) REFERENCES staff(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_verification_codes_one_principal
        CHECK ((user_id IS NOT NULL)::int + (staff_id IS NOT NULL)::int = 1),
    CONSTRAINT chk_verification_codes_purpose
        CHECK (purpose IN ('email_verify', 'phone_verify', 'password_reset', 'login_mfa')),
    CONSTRAINT chk_verification_codes_channel CHECK (channel IN ('email', 'sms')),
    CONSTRAINT chk_verification_codes_attempts
        CHECK (attempt_count >= 0 AND attempt_count <= max_attempts),
    CONSTRAINT chk_verification_codes_expiry CHECK (expires_at > created_at)
);

COMMENT ON TABLE verification_codes IS 'Short-lived OTPs with expiry and attempt limits';
CREATE INDEX idx_verification_codes_user_id ON verification_codes(user_id) WHERE consumed_at IS NULL;
CREATE INDEX idx_verification_codes_staff_id ON verification_codes(staff_id) WHERE consumed_at IS NULL;
CREATE INDEX idx_verification_codes_expires_at ON verification_codes(expires_at);
-- One live code per principal per purpose; re-requesting must supersede the old one.
CREATE UNIQUE INDEX uq_verification_codes_active_user
    ON verification_codes(user_id, purpose) WHERE consumed_at IS NULL AND user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_verification_codes_active_staff
    ON verification_codes(staff_id, purpose) WHERE consumed_at IS NULL AND staff_id IS NOT NULL;

-- ============================================================
-- 5. TRANSACTIONAL TABLES
-- ============================================================

-- Bookable capacity per office / service / day / slot.
-- This is what actually caps the queue; appointments cannot exist without one.
CREATE TABLE appointment_slots (
    id              SERIAL PRIMARY KEY,
    office_id       INTEGER NOT NULL,
    office_service_id INTEGER,                  -- NULL = slot open to any service at this office
    slot_date       DATE NOT NULL,
    time_slot       VARCHAR(20) NOT NULL,       -- e.g., '09:00-10:00'
    capacity        INTEGER NOT NULL,
    booked_count    INTEGER NOT NULL DEFAULT 0, -- maintained by trg_appointments_slot_count
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ,

    CONSTRAINT fk_appointment_slots_office
        FOREIGN KEY (office_id) REFERENCES offices(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    -- Composite: a slot cannot advertise a service its own office does not offer.
    -- MATCH SIMPLE, so a NULL office_service_id (open slot) is still allowed.
    CONSTRAINT fk_appointment_slots_service_office
        FOREIGN KEY (office_service_id, office_id) REFERENCES office_services(id, office_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_appointment_slots UNIQUE (office_id, office_service_id, slot_date, time_slot),
    CONSTRAINT chk_appointment_slots_capacity CHECK (capacity > 0),
    -- The overbooking guard. Enforced by the DB, not by application logic.
    CONSTRAINT chk_appointment_slots_not_overbooked
        CHECK (booked_count >= 0 AND booked_count <= capacity)
);

COMMENT ON TABLE appointment_slots IS 'Bookable capacity per office/service/date/time; booked_count is trigger-maintained';
CREATE INDEX idx_appointment_slots_office_date ON appointment_slots(office_id, slot_date);
CREATE INDEX idx_appointment_slots_service_id ON appointment_slots(office_service_id);
CREATE INDEX idx_appointment_slots_available
    ON appointment_slots(office_id, slot_date) WHERE is_active = TRUE;

CREATE TRIGGER trg_appointment_slots_updated_at BEFORE UPDATE ON appointment_slots
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Citizen requests / applications
CREATE TABLE requests (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL,
    office_service_id   INTEGER NOT NULL,               -- the specific office's offering of a catalogue service
    office_id           INTEGER NOT NULL,
    status_id           INTEGER NOT NULL,               -- defaulted by trg_requests_before_insert
    priority_id         INTEGER,
    assigned_staff_id   INTEGER,                        -- NULL = unassigned, sitting in the office queue
    assigned_at         TIMESTAMPTZ,
    form_data           JSONB NOT NULL DEFAULT '{}',    -- Dynamic form responses (contains PII)
    tracking_code       VARCHAR(50) NOT NULL,           -- generated by trg_requests_before_insert
    submitted_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    estimated_ready_date DATE,
    completed_at        TIMESTAMPTZ,
    notes               TEXT,                           -- Internal notes by staff
    updated_at          TIMESTAMPTZ,

    CONSTRAINT fk_requests_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Composite instead of two independent FKs: this is what makes it impossible
    -- to file a request against an office that does not offer the service.
    CONSTRAINT fk_requests_service_office
        FOREIGN KEY (office_service_id, office_id) REFERENCES office_services(id, office_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_requests_office
        FOREIGN KEY (office_id) REFERENCES offices(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_requests_status
        FOREIGN KEY (status_id) REFERENCES request_statuses(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_requests_priority
        FOREIGN KEY (priority_id) REFERENCES priorities(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    -- A departing employee's row disappearing must not block, nor orphan, the request.
    CONSTRAINT fk_requests_assigned_staff
        FOREIGN KEY (assigned_staff_id) REFERENCES staff(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT uq_requests_tracking_code UNIQUE (tracking_code),
    CONSTRAINT chk_requests_completed_after_submitted
        CHECK (completed_at IS NULL OR completed_at >= submitted_at),
    -- One-directional, NOT a biconditional. ON DELETE SET NULL nulls only
    -- assigned_staff_id; a biconditional would then fail and make deleting a
    -- staff member impossible. trg_requests_sync_assignment keeps the pair tidy.
    CONSTRAINT chk_requests_assigned_at
        CHECK (assigned_staff_id IS NULL OR assigned_at IS NOT NULL)
);

COMMENT ON TABLE requests IS 'Citizen service requests / applications';
COMMENT ON COLUMN requests.assigned_staff_id IS 'Staff member currently handling this request; NULL = unassigned';
CREATE INDEX idx_requests_user_id ON requests(user_id);
CREATE INDEX idx_requests_service_id ON requests(office_service_id);
CREATE INDEX idx_requests_office_id ON requests(office_id);
CREATE INDEX idx_requests_status_id ON requests(status_id);
CREATE INDEX idx_requests_priority_id ON requests(priority_id);
CREATE INDEX idx_requests_assigned_staff_id ON requests(assigned_staff_id);
CREATE INDEX idx_requests_submitted_at ON requests(submitted_at);
CREATE INDEX idx_requests_estimated_ready ON requests(estimated_ready_date);
-- Office queue view: unassigned work, oldest first.
CREATE INDEX idx_requests_office_queue
    ON requests(office_id, submitted_at) WHERE assigned_staff_id IS NULL;

-- Generates the public tracking code and applies the default status, so neither
-- has to be writable by the citizen submitting the request.
--
-- SECURITY DEFINER: the collision pre-check must see every tracking code, but a
-- citizen connection is restricted by RLS to its own rows and would never see a
-- clash. (uq_requests_tracking_code is still the real guarantee.)
CREATE OR REPLACE FUNCTION fn_requests_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts INTEGER := 0;
BEGIN
    IF NEW.status_id IS NULL THEN
        SELECT id INTO NEW.status_id FROM request_statuses WHERE code = 'submitted';
    END IF;

    IF NEW.tracking_code IS NULL THEN
        LOOP
            NEW.tracking_code := 'WTQ-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
                                 upper(encode(gen_random_bytes(5), 'hex'));
            EXIT WHEN NOT EXISTS (SELECT 1 FROM requests WHERE tracking_code = NEW.tracking_code);
            v_attempts := v_attempts + 1;
            IF v_attempts > 10 THEN
                RAISE EXCEPTION 'could not allocate a unique tracking code';
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_requests_before_insert BEFORE INSERT ON requests
    FOR EACH ROW EXECUTE FUNCTION fn_requests_before_insert();

-- Keeps assigned_at in lockstep with assigned_staff_id, including when the FK's
-- ON DELETE SET NULL fires during staff offboarding.
CREATE OR REPLACE FUNCTION fn_requests_sync_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id THEN
        NEW.assigned_at := CASE
            WHEN NEW.assigned_staff_id IS NULL THEN NULL
            ELSE CURRENT_TIMESTAMP
        END;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_requests_sync_assignment BEFORE UPDATE ON requests
    FOR EACH ROW EXECUTE FUNCTION fn_requests_sync_assignment();

CREATE TRIGGER trg_requests_updated_at BEFORE UPDATE ON requests
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Uploaded documents for requests
CREATE TABLE documents (
    id              SERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL,
    -- Internal object-storage key (e.g. 'requests/2026/07/a1b2c3.pdf'), NOT a
    -- fetchable URL. The API must authorize the caller and then hand out a
    -- short-lived signed URL. A CIN scan behind a guessable public link is a breach.
    storage_key     VARCHAR(500) NOT NULL,
    document_type   VARCHAR(100) NOT NULL,      -- e.g., 'cin_copy', 'birth_certificate'
    mime_type       VARCHAR(100),
    file_size_bytes BIGINT,
    checksum_sha256 CHAR(64),                   -- integrity / duplicate detection
    status          VARCHAR(50) NOT NULL DEFAULT 'pending',
    verified_by     INTEGER,
    verified_at     TIMESTAMPTZ,
    uploaded_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_documents_request
        FOREIGN KEY (request_id) REFERENCES requests(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_documents_verified_by
        FOREIGN KEY (verified_by) REFERENCES staff(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_documents_status CHECK (status IN ('pending', 'verified', 'rejected')),
    -- Reject anything that looks like a URL; this column stores a key, not a link.
    CONSTRAINT chk_documents_storage_key_not_url CHECK (storage_key !~ '://'),
    CONSTRAINT chk_documents_file_size CHECK (file_size_bytes IS NULL OR file_size_bytes > 0),
    -- A verification must name the verifier and the moment.
    CONSTRAINT chk_documents_verification_complete
        CHECK (status = 'pending' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

COMMENT ON TABLE documents IS 'Documents uploaded by citizens; served only via short-lived signed URLs after an authz check';
COMMENT ON COLUMN documents.storage_key IS 'Private object-storage key. Never expose directly; never make the bucket public.';
CREATE INDEX idx_documents_request_id ON documents(request_id);
CREATE INDEX idx_documents_status ON documents(status);

-- Request status history (audit trail)
CREATE TABLE status_history (
    id              SERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL,
    old_status_id   INTEGER,
    new_status_id   INTEGER NOT NULL,
    changed_by      INTEGER,                    -- Staff member who changed it
    changed_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    reason          TEXT,                       -- Optional explanation

    CONSTRAINT fk_status_history_request
        FOREIGN KEY (request_id) REFERENCES requests(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_status_history_old_status
        FOREIGN KEY (old_status_id) REFERENCES request_statuses(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_status_history_new_status
        FOREIGN KEY (new_status_id) REFERENCES request_statuses(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_status_history_changed_by
        FOREIGN KEY (changed_by) REFERENCES staff(id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

COMMENT ON TABLE status_history IS 'Audit log of all status changes on requests';
CREATE INDEX idx_status_history_request_id ON status_history(request_id);
CREATE INDEX idx_status_history_changed_at ON status_history(changed_at);
CREATE INDEX idx_status_history_changed_by ON status_history(changed_by);

-- Appointments for in-person visits
CREATE TABLE appointments (
    id                  SERIAL PRIMARY KEY,
    slot_id             INTEGER NOT NULL,           -- date/time live on the slot; no duplicated copy to drift
    request_id          INTEGER,
    user_id             INTEGER NOT NULL,
    office_id           INTEGER NOT NULL,           -- derived from the slot by trigger, never trusted from input
    office_service_id   INTEGER NOT NULL,           -- ditto
    status              VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    queue_number        VARCHAR(20),                -- Physical queue ticket
    reason              TEXT,                       -- Purpose of visit
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_appointments_slot
        FOREIGN KEY (slot_id) REFERENCES appointment_slots(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_appointments_request
        FOREIGN KEY (request_id) REFERENCES requests(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_appointments_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_appointments_service_office
        FOREIGN KEY (office_service_id, office_id) REFERENCES office_services(id, office_id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_appointments_office
        FOREIGN KEY (office_id) REFERENCES offices(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_appointments_status
        CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'))
);

COMMENT ON TABLE appointments IS 'Scheduled appointments for in-person visits; capacity enforced via appointment_slots';
CREATE INDEX idx_appointments_slot_id ON appointments(slot_id);
CREATE INDEX idx_appointments_request_id ON appointments(request_id);
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_office_id ON appointments(office_id);
CREATE INDEX idx_appointments_status ON appointments(status);
-- One live booking per citizen per slot.
CREATE UNIQUE INDEX uq_appointments_user_slot
    ON appointments(slot_id, user_id) WHERE status IN ('scheduled', 'completed');

-- office_id / office_service_id are derived from the booked slot rather than
-- accepted from the client. Staff RLS keys off appointments.office_id, so
-- letting a caller set it freely would let them plant rows in another office's book.
CREATE OR REPLACE FUNCTION fn_appointments_derive_from_slot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_office_id         INTEGER;
    v_office_service_id INTEGER;
BEGIN
    SELECT office_id, office_service_id INTO v_office_id, v_office_service_id
      FROM appointment_slots WHERE id = NEW.slot_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'appointment slot % does not exist', NEW.slot_id;
    END IF;

    NEW.office_id := v_office_id;

    IF v_office_service_id IS NOT NULL THEN
        NEW.office_service_id := v_office_service_id;
    ELSIF NOT EXISTS (
        SELECT 1 FROM office_services
         WHERE id = NEW.office_service_id AND office_id = v_office_id AND is_available
    ) THEN
        RAISE EXCEPTION 'service % is not offered by office %',
            NEW.office_service_id, v_office_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointments_derive_from_slot
    BEFORE INSERT OR UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION fn_appointments_derive_from_slot();

-- Keeps appointment_slots.booked_count in sync. The UPDATE takes a row lock on
-- the slot, so concurrent bookings serialize and the chk_..._not_overbooked
-- CHECK rejects the one that would exceed capacity.
--
-- SECURITY DEFINER: citizens hold only SELECT on appointment_slots. Without this
-- the counter UPDATE fails and no citizen can ever book an appointment.
CREATE OR REPLACE FUNCTION fn_sync_slot_booked_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_counts BOOLEAN := FALSE;
    v_new_counts BOOLEAN := FALSE;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old_counts := OLD.status IN ('scheduled', 'completed');
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new_counts := NEW.status IN ('scheduled', 'completed');
    END IF;

    -- Release the old slot when the booking stops counting or moves.
    IF v_old_counts AND (NOT v_new_counts OR TG_OP = 'DELETE' OR NEW.slot_id <> OLD.slot_id) THEN
        UPDATE appointment_slots SET booked_count = booked_count - 1 WHERE id = OLD.slot_id;
    END IF;

    -- Claim the new slot.
    IF v_new_counts AND (NOT v_old_counts OR TG_OP = 'INSERT' OR NEW.slot_id <> OLD.slot_id) THEN
        UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = NEW.slot_id;
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_appointments_slot_count
    AFTER INSERT OR UPDATE OR DELETE ON appointments
    FOR EACH ROW EXECUTE FUNCTION fn_sync_slot_booked_count();

-- Notifications to citizens
CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    request_id      INTEGER,
    type            VARCHAR(50) NOT NULL,       -- e.g., 'status_change', 'appointment_reminder'
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    sent_via        VARCHAR(20) NOT NULL DEFAULT 'push',
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notifications_request
        FOREIGN KEY (request_id) REFERENCES requests(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_notifications_sent_via CHECK (sent_via IN ('push', 'email', 'sms'))
);

COMMENT ON TABLE notifications IS 'System notifications sent to citizens';
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_request_id ON notifications(request_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- Payments for services
CREATE TABLE payments (
    id                  SERIAL PRIMARY KEY,
    request_id          INTEGER,
    user_id             INTEGER NOT NULL,
    type_id             INTEGER NOT NULL,           -- FK to payment_types
    method_id           INTEGER,                    -- FK to payment_methods
    reference_number    VARCHAR(100),               -- Bank/transaction reference
    amount              DECIMAL(12, 3) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'TND',
    transaction_id      VARCHAR(255),               -- External payment gateway ID
    status              VARCHAR(50) NOT NULL DEFAULT 'pending',
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_payments_request
        FOREIGN KEY (request_id) REFERENCES requests(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_payments_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payments_type
        FOREIGN KEY (type_id) REFERENCES payment_types(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_payments_method
        FOREIGN KEY (method_id) REFERENCES payment_methods(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_payments_status CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    CONSTRAINT chk_payments_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_payments_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_payments_paid_after_created CHECK (paid_at IS NULL OR paid_at >= created_at)
);

COMMENT ON TABLE payments IS 'Financial transactions for government services';
COMMENT ON COLUMN payments.transaction_id IS 'Gateway reference. Do not write to application logs in plaintext; masked in v_payment_overview.';
COMMENT ON COLUMN payments.reference_number IS 'Bank reference. Do not write to application logs in plaintext.';
CREATE INDEX idx_payments_request_id ON payments(request_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_reference ON payments(reference_number);

-- STEG (Electricity/Gas) account linkage
CREATE TABLE user_steg_account (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    contract_number VARCHAR(50) NOT NULL,
    meter_number    VARCHAR(50),
    address         TEXT,
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    added_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_steg_account_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_user_steg_contract UNIQUE (contract_number),
    -- Loose numeric guard; tighten once the exact STEG reference format is confirmed.
    CONSTRAINT chk_user_steg_contract_format CHECK (contract_number ~ '^[0-9]{6,20}$')
);

COMMENT ON TABLE user_steg_account IS 'Linked STEG (Tunisian Electricity/Gas) accounts';
CREATE INDEX idx_user_steg_account_user_id ON user_steg_account(user_id);
CREATE UNIQUE INDEX uq_one_primary_steg_per_user
    ON user_steg_account(user_id) WHERE is_primary = TRUE;

-- ============================================================
-- 6. ACCESS AUDIT
-- ============================================================

-- status_history records what changed. This records who *looked*.
-- Required to detect a clerk browsing a neighbour's file, and to answer
-- "who accessed this citizen's record" during a compliance review.
CREATE TABLE access_log (
    id              BIGSERIAL PRIMARY KEY,
    staff_id        INTEGER,                    -- NULL if a citizen accessed their own data
    user_id         INTEGER,                    -- the citizen whose data was accessed
    action          VARCHAR(50) NOT NULL,
    resource_type   VARCHAR(50) NOT NULL,       -- 'request','document','user','payment','appointment'
    resource_id     INTEGER,
    request_id      INTEGER,
    document_id     INTEGER,
    query_params    JSONB,                      -- search terms / filters, for misuse detection
    ip_address      INET,
    user_agent      TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- SET NULL, not CASCADE: deleting a staff row must never erase their access trail.
    CONSTRAINT fk_access_log_staff
        FOREIGN KEY (staff_id) REFERENCES staff(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_access_log_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_access_log_request
        FOREIGN KEY (request_id) REFERENCES requests(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_access_log_document
        FOREIGN KEY (document_id) REFERENCES documents(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_access_log_action
        CHECK (action IN ('view', 'list', 'search', 'download', 'export', 'print',
                          'anonymize', 'deactivate'))
);

COMMENT ON TABLE access_log IS 'Read-access audit trail: which staff member viewed/exported which citizen record, and when';
CREATE INDEX idx_access_log_staff_id ON access_log(staff_id, occurred_at DESC);
CREATE INDEX idx_access_log_user_id ON access_log(user_id, occurred_at DESC);
CREATE INDEX idx_access_log_request_id ON access_log(request_id);
CREATE INDEX idx_access_log_occurred_at ON access_log(occurred_at DESC);

-- ============================================================
-- 7. ROW-LEVEL SECURITY
-- ============================================================
--
-- Second layer of defence: even if an application query forgets its WHERE
-- clause, the database will not return another citizen's rows.
--
-- OPERATIONAL REQUIREMENT — RLS does not apply to the table owner or to
-- superusers. The application MUST connect as watiq_citizen / watiq_staff
-- (never as the schema owner) and set the session context per request:
--
--     SET LOCAL app.current_user_id   = '123';   -- citizen connections
--     SET LOCAL app.current_staff_id  = '45';    -- staff connections
--     SET LOCAL app.current_office_id = '7';     -- staff connections
--
-- Use SET LOCAL inside the transaction so pooled connections cannot leak
-- context between requests.
--
-- SCOPE NOTE: these GUCs are asserted by the application. RLS here defends
-- against application *bugs* (a missing WHERE clause, a wrong join). It does
-- not defend against an attacker who can already run arbitrary SQL on the
-- connection, since they could simply SET a different office id.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'watiq_citizen') THEN
        CREATE ROLE watiq_citizen NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'watiq_staff') THEN
        CREATE ROLE watiq_staff NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'watiq_auth') THEN
        -- Login/registration service: needs credential tables before a session exists.
        CREATE ROLE watiq_auth NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'watiq_auditor') THEN
        CREATE ROLE watiq_auditor NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'watiq_admin') THEN
        -- Back-office / data-protection officer. Executes erasure requests.
        CREATE ROLE watiq_admin NOLOGIN;
    END IF;
END
$$;

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff               ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_steg_account   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_log          ENABLE ROW LEVEL SECURITY;
-- Not for confidentiality (the catalogue is public by design) but so an office
-- can only edit its own availability rows.
ALTER TABLE office_services     ENABLE ROW LEVEL SECURITY;

-- --- office_services ---------------------------------------
-- Everyone may read the whole catalogue: national discovery is the point.
CREATE POLICY office_services_public_read ON office_services
    FOR SELECT TO watiq_citizen, watiq_staff, watiq_auditor USING (TRUE);

-- An office may only change its own offering, and only with slot.manage.
CREATE POLICY office_services_staff_manage ON office_services
    FOR UPDATE TO watiq_staff
    USING (office_id = app_current_office_id()
           AND fn_staff_has_permission(app_current_staff_id(), 'slot.manage'))
    WITH CHECK (office_id = app_current_office_id());

CREATE POLICY office_services_admin ON office_services
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- users -------------------------------------------------
CREATE POLICY users_self_select ON users
    FOR SELECT TO watiq_citizen USING (id = app_current_user_id());
CREATE POLICY users_self_update ON users
    FOR UPDATE TO watiq_citizen
    USING (id = app_current_user_id())
    WITH CHECK (id = app_current_user_id());

-- Staff may only see citizens who actually have business with their office.
CREATE POLICY users_staff_office_scope ON users
    FOR SELECT TO watiq_staff
    USING (EXISTS (
        SELECT 1 FROM requests r
        WHERE r.user_id = users.id AND r.office_id = app_current_office_id()
    ) OR EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.user_id = users.id AND a.office_id = app_current_office_id()
    ));

-- Ministry-level oversight. The RBAC tables are now load-bearing: this is the
-- only way a staff member sees beyond their own office, and it is granted by
-- role, not by a flag in application code.
CREATE POLICY users_staff_national ON users
    FOR SELECT TO watiq_staff
    USING (fn_staff_has_permission(app_current_staff_id(), 'request.view_all_offices'));

CREATE POLICY users_auth_service ON users
    FOR ALL TO watiq_auth USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY users_admin ON users
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- staff -------------------------------------------------
CREATE POLICY staff_same_office ON staff
    FOR SELECT TO watiq_staff
    USING (office_id = app_current_office_id());
CREATE POLICY staff_national ON staff
    FOR SELECT TO watiq_staff
    USING (fn_staff_has_permission(app_current_staff_id(), 'request.view_all_offices'));
CREATE POLICY staff_auth_service ON staff
    FOR ALL TO watiq_auth USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY staff_admin ON staff
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- staff_recovery_codes ----------------------------------
CREATE POLICY staff_recovery_codes_auth_service ON staff_recovery_codes
    FOR ALL TO watiq_auth USING (TRUE) WITH CHECK (TRUE);

-- --- requests ----------------------------------------------
CREATE POLICY requests_owner_select ON requests
    FOR SELECT TO watiq_citizen USING (user_id = app_current_user_id());

CREATE POLICY requests_owner_insert ON requests
    FOR INSERT TO watiq_citizen WITH CHECK (user_id = app_current_user_id());

-- A citizen may amend their own request only while it is still open. Once a
-- request reaches a terminal status it is an administrative record.
CREATE POLICY requests_owner_update ON requests
    FOR UPDATE TO watiq_citizen
    USING (user_id = app_current_user_id()
           AND NOT EXISTS (SELECT 1 FROM request_statuses rs
                            WHERE rs.id = requests.status_id AND rs.is_final))
    WITH CHECK (user_id = app_current_user_id());

CREATE POLICY requests_staff_office ON requests
    FOR ALL TO watiq_staff
    USING (office_id = app_current_office_id())
    WITH CHECK (office_id = app_current_office_id());

CREATE POLICY requests_staff_national ON requests
    FOR SELECT TO watiq_staff
    USING (fn_staff_has_permission(app_current_staff_id(), 'request.view_all_offices'));

CREATE POLICY requests_admin ON requests
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- documents ---------------------------------------------
CREATE POLICY documents_owner_select ON documents
    FOR SELECT TO watiq_citizen
    USING (EXISTS (SELECT 1 FROM requests r
                    WHERE r.id = documents.request_id AND r.user_id = app_current_user_id()));

CREATE POLICY documents_owner_insert ON documents
    FOR INSERT TO watiq_citizen
    WITH CHECK (EXISTS (SELECT 1 FROM requests r
                         JOIN request_statuses rs ON rs.id = r.status_id
                         WHERE r.id = documents.request_id
                           AND r.user_id = app_current_user_id()
                           AND rs.is_final = FALSE));

-- A citizen may withdraw an upload only while it is still pending. Deleting a
-- document a clerk has already verified would be destroying evidence.
CREATE POLICY documents_owner_delete ON documents
    FOR DELETE TO watiq_citizen
    USING (status = 'pending'
           AND EXISTS (SELECT 1 FROM requests r
                        WHERE r.id = documents.request_id AND r.user_id = app_current_user_id()));

CREATE POLICY documents_staff_office ON documents
    FOR ALL TO watiq_staff
    USING (EXISTS (SELECT 1 FROM requests r
                    WHERE r.id = documents.request_id AND r.office_id = app_current_office_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM requests r
                         WHERE r.id = documents.request_id AND r.office_id = app_current_office_id()));

CREATE POLICY documents_admin ON documents
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- status_history ----------------------------------------
CREATE POLICY status_history_owner ON status_history
    FOR SELECT TO watiq_citizen
    USING (EXISTS (SELECT 1 FROM requests r
                    WHERE r.id = status_history.request_id AND r.user_id = app_current_user_id()));

CREATE POLICY status_history_staff_office ON status_history
    FOR ALL TO watiq_staff
    USING (EXISTS (SELECT 1 FROM requests r
                    WHERE r.id = status_history.request_id AND r.office_id = app_current_office_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM requests r
                         WHERE r.id = status_history.request_id AND r.office_id = app_current_office_id()));

CREATE POLICY status_history_staff_national ON status_history
    FOR SELECT TO watiq_staff
    USING (fn_staff_has_permission(app_current_staff_id(), 'audit.view'));

-- --- appointments ------------------------------------------
CREATE POLICY appointments_owner_select ON appointments
    FOR SELECT TO watiq_citizen USING (user_id = app_current_user_id());

CREATE POLICY appointments_owner_insert ON appointments
    FOR INSERT TO watiq_citizen WITH CHECK (user_id = app_current_user_id());

-- A citizen may cancel. Marking themselves 'completed' or 'no_show' is the
-- office's call, not theirs.
CREATE POLICY appointments_owner_update ON appointments
    FOR UPDATE TO watiq_citizen
    USING (user_id = app_current_user_id() AND status = 'scheduled')
    WITH CHECK (user_id = app_current_user_id() AND status IN ('scheduled', 'cancelled'));

CREATE POLICY appointments_staff_office ON appointments
    FOR ALL TO watiq_staff
    USING (office_id = app_current_office_id())
    WITH CHECK (office_id = app_current_office_id());

CREATE POLICY appointments_admin ON appointments
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- notifications -----------------------------------------
CREATE POLICY notifications_owner_select ON notifications
    FOR SELECT TO watiq_citizen USING (user_id = app_current_user_id());
CREATE POLICY notifications_owner_update ON notifications
    FOR UPDATE TO watiq_citizen
    USING (user_id = app_current_user_id())
    WITH CHECK (user_id = app_current_user_id());

-- Staff notify citizens who have business at their office.
CREATE POLICY notifications_staff ON notifications
    FOR SELECT TO watiq_staff
    USING (EXISTS (SELECT 1 FROM requests r
                    WHERE r.user_id = notifications.user_id AND r.office_id = app_current_office_id()));
CREATE POLICY notifications_staff_insert ON notifications
    FOR INSERT TO watiq_staff
    WITH CHECK (EXISTS (SELECT 1 FROM requests r
                         WHERE r.user_id = notifications.user_id AND r.office_id = app_current_office_id()));

CREATE POLICY notifications_admin ON notifications
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- payments ----------------------------------------------
CREATE POLICY payments_owner ON payments
    FOR SELECT TO watiq_citizen
    USING (user_id = app_current_user_id());

CREATE POLICY payments_staff_select ON payments
    FOR SELECT TO watiq_staff
    USING (EXISTS (SELECT 1 FROM requests r
                    WHERE r.id = payments.request_id AND r.office_id = app_current_office_id()));

-- Changing a payment requires the payment.refund permission, so a clerk whose
-- role does not hold it cannot alter financial records even though the table
-- is otherwise in their office's scope.
CREATE POLICY payments_staff_update ON payments
    FOR UPDATE TO watiq_staff
    USING (fn_staff_has_permission(app_current_staff_id(), 'payment.refund')
           AND EXISTS (SELECT 1 FROM requests r
                        WHERE r.id = payments.request_id AND r.office_id = app_current_office_id()))
    WITH CHECK (fn_staff_has_permission(app_current_staff_id(), 'payment.refund')
           AND EXISTS (SELECT 1 FROM requests r
                        WHERE r.id = payments.request_id AND r.office_id = app_current_office_id()));

CREATE POLICY payments_admin ON payments
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- user_steg_account -------------------------------------
CREATE POLICY steg_owner ON user_steg_account
    FOR ALL TO watiq_citizen
    USING (user_id = app_current_user_id())
    WITH CHECK (user_id = app_current_user_id());
CREATE POLICY steg_admin ON user_steg_account
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- sessions ----------------------------------------------
CREATE POLICY sessions_own_citizen ON sessions
    FOR ALL TO watiq_citizen
    USING (user_id = app_current_user_id())
    WITH CHECK (user_id = app_current_user_id());

CREATE POLICY sessions_own_staff ON sessions
    FOR ALL TO watiq_staff
    USING (staff_id = app_current_staff_id())
    WITH CHECK (staff_id = app_current_staff_id());

CREATE POLICY sessions_auth_service ON sessions
    FOR ALL TO watiq_auth USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY sessions_admin ON sessions
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);

-- --- verification_codes ------------------------------------
CREATE POLICY verification_codes_auth_service ON verification_codes
    FOR ALL TO watiq_auth USING (TRUE) WITH CHECK (TRUE);

-- --- access_log --------------------------------------------
-- Append-only, and non-forgeable: the actor is pinned to the session context so
-- a staff member cannot attribute their own lookups to a colleague.
CREATE POLICY access_log_insert_staff ON access_log
    FOR INSERT TO watiq_staff
    WITH CHECK (staff_id = app_current_staff_id());

CREATE POLICY access_log_insert_citizen ON access_log
    FOR INSERT TO watiq_citizen
    WITH CHECK (user_id = app_current_user_id() AND staff_id IS NULL);

CREATE POLICY access_log_read_auditor ON access_log
    FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY access_log_admin ON access_log
    FOR ALL TO watiq_admin USING (TRUE) WITH CHECK (TRUE);
-- NOTE: watiq_staff/watiq_citizen have INSERT but no SELECT policy here, so
-- `INSERT INTO access_log ... RETURNING id` will fail. Insert without RETURNING.

-- ------------------------------------------------------------
-- 7b. TABLE AND COLUMN PRIVILEGES
--
-- RLS answers "which rows". It says nothing about "which columns", and a
-- whole-table UPDATE grant lets a citizen set their own request to 'approved'
-- inside a policy that is working perfectly. Writes are therefore granted
-- column by column.
-- ------------------------------------------------------------

-- Reference data / the searchable catalogue: readable by any authenticated principal.
GRANT SELECT ON categories, offices, service_catalog, office_services, priorities,
                request_statuses, payment_types, payment_methods, appointment_slots
    TO watiq_citizen, watiq_staff;

-- An office manages its own availability; the catalogue itself is national and
-- is edited only by watiq_admin.
GRANT UPDATE (is_available, processing_time_override, notes)
    ON office_services TO watiq_staff;

GRANT SELECT ON roles, permissions, role_permissions TO watiq_staff;

-- --- watiq_citizen -----------------------------------------
GRANT SELECT (id, national_id, first_name, last_name, email, phone, date_of_birth,
              governorate, city, address, email_verified, phone_verified,
              is_active, last_login_at, created_at, updated_at)
    ON users TO watiq_citizen;
GRANT UPDATE (first_name, last_name, email, phone, date_of_birth,
              governorate, city, address)
    ON users TO watiq_citizen;

-- status_id and tracking_code are absent on purpose: both are set by
-- trg_requests_before_insert, so a citizen cannot file a pre-approved request.
GRANT SELECT ON requests TO watiq_citizen;
GRANT INSERT (user_id, office_service_id, office_id, priority_id, form_data)
    ON requests TO watiq_citizen;
GRANT UPDATE (form_data) ON requests TO watiq_citizen;

-- No status/verified_by/verified_at: a citizen cannot self-verify an upload.
GRANT SELECT ON documents TO watiq_citizen;
GRANT INSERT (request_id, storage_key, document_type, mime_type,
              file_size_bytes, checksum_sha256)
    ON documents TO watiq_citizen;
GRANT DELETE ON documents TO watiq_citizen;

GRANT SELECT ON status_history TO watiq_citizen;

GRANT SELECT ON appointments TO watiq_citizen;
GRANT INSERT (slot_id, request_id, user_id, office_id, office_service_id, reason)
    ON appointments TO watiq_citizen;
GRANT UPDATE (status) ON appointments TO watiq_citizen;

-- is_read only: a citizen cannot rewrite the text of a notice sent to them.
GRANT SELECT ON notifications TO watiq_citizen;
GRANT UPDATE (is_read) ON notifications TO watiq_citizen;

GRANT SELECT ON payments TO watiq_citizen;

GRANT SELECT ON user_steg_account TO watiq_citizen;
GRANT INSERT (user_id, contract_number, meter_number, address, is_primary)
    ON user_steg_account TO watiq_citizen;
GRANT UPDATE (meter_number, address, is_primary) ON user_steg_account TO watiq_citizen;
GRANT DELETE ON user_steg_account TO watiq_citizen;

GRANT SELECT (id, device_label, ip_address, user_agent, issued_at,
              last_seen_at, expires_at, revoked_at, revoked_reason)
    ON sessions TO watiq_citizen;             -- device list, without the token hash
GRANT UPDATE (revoked_at, revoked_reason) ON sessions TO watiq_citizen;  -- self-logout
GRANT INSERT ON access_log TO watiq_citizen;

-- --- watiq_staff -------------------------------------------
GRANT SELECT (id, national_id, first_name, last_name, email, phone, date_of_birth,
              governorate, city, address, email_verified, phone_verified,
              is_active, anonymized_at, created_at)
    ON users TO watiq_staff;
GRANT SELECT (id, office_id, role_id, name, email, is_active, last_login_at, created_at)
    ON staff TO watiq_staff;                  -- no password_hash, no mfa_secret

-- Workflow columns only. user_id, office_service_id, office_id, tracking_code,
-- form_data and submitted_at are the citizen's submission and are immutable here.
GRANT SELECT ON requests TO watiq_staff;
GRANT UPDATE (status_id, priority_id, assigned_staff_id, estimated_ready_date,
              completed_at, notes)
    ON requests TO watiq_staff;

GRANT SELECT ON documents TO watiq_staff;
GRANT UPDATE (status, verified_by, verified_at) ON documents TO watiq_staff;

GRANT SELECT, INSERT ON status_history TO watiq_staff;
GRANT SELECT, INSERT, UPDATE, DELETE ON appointments TO watiq_staff;
GRANT SELECT, INSERT, UPDATE ON appointment_slots TO watiq_staff;
GRANT SELECT, INSERT ON notifications TO watiq_staff;

-- amount, currency, user_id and type_id are not writable by office staff at
-- all; the remaining columns additionally require payment.refund via RLS.
GRANT SELECT ON payments TO watiq_staff;
GRANT UPDATE (status, paid_at, method_id, reference_number, transaction_id)
    ON payments TO watiq_staff;

GRANT SELECT (id, device_label, ip_address, user_agent, issued_at,
              last_seen_at, expires_at, revoked_at, revoked_reason)
    ON sessions TO watiq_staff;
GRANT UPDATE (revoked_at, revoked_reason) ON sessions TO watiq_staff;
GRANT INSERT ON access_log TO watiq_staff;

-- --- watiq_auth --------------------------------------------
GRANT SELECT, INSERT, UPDATE ON users, staff, sessions, verification_codes,
                                 staff_recovery_codes TO watiq_auth;
GRANT DELETE ON sessions, verification_codes, staff_recovery_codes TO watiq_auth;

-- --- watiq_admin -------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON users, requests, documents, appointments,
              notifications, payments, user_steg_account, sessions, staff, access_log
    TO watiq_admin;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO watiq_admin;

-- --- watiq_auditor -----------------------------------------
-- Enumerated, not "ON ALL TABLES": a table-level GRANT SELECT cannot afterwards
-- be narrowed with REVOKE SELECT (password_hash) -- Postgres treats a
-- column-level REVOKE against a table-level grant as a no-op. The only way to
-- withhold a column is to never grant the table as a whole.
GRANT SELECT (id, national_id, first_name, last_name, email, phone, date_of_birth,
              governorate, city, address, email_verified, phone_verified, is_active,
              deactivated_at, anonymized_at, last_login_at, created_at, updated_at)
    ON users TO watiq_auditor;
GRANT SELECT (id, office_id, role_id, name, email, mfa_enabled, mfa_enrolled_at,
              failed_login_attempts, locked_until, last_login_at, is_active, created_at)
    ON staff TO watiq_auditor;
GRANT SELECT (id, user_id, staff_id, device_label, ip_address, user_agent,
              mfa_satisfied, issued_at, last_seen_at, expires_at, revoked_at, revoked_reason)
    ON sessions TO watiq_auditor;

GRANT SELECT ON access_log, status_history, requests, documents, appointments,
                appointment_slots, notifications, payments, user_steg_account,
                offices, service_catalog, office_services, categories, priorities,
                request_statuses, payment_types, payment_methods,
                roles, permissions, role_permissions
    TO watiq_auditor;

-- RLS is on for most of the above, and a role with no policy sees zero rows.
CREATE POLICY users_auditor         ON users         FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY staff_auditor         ON staff         FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY requests_auditor      ON requests      FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY documents_auditor     ON documents     FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY status_history_auditor ON status_history FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY appointments_auditor  ON appointments  FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY notifications_auditor ON notifications FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY payments_auditor      ON payments      FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY steg_auditor          ON user_steg_account FOR SELECT TO watiq_auditor USING (TRUE);
CREATE POLICY sessions_auditor      ON sessions      FOR SELECT TO watiq_auditor USING (TRUE);
-- Deliberately absent: verification_codes and staff_recovery_codes. Live OTPs
-- and recovery codes are not audit material.

-- Sequences, scoped to what each role actually inserts into.
GRANT USAGE, SELECT ON SEQUENCE requests_id_seq, documents_id_seq,
    appointments_id_seq, user_steg_account_id_seq, access_log_id_seq
    TO watiq_citizen;
GRANT USAGE, SELECT ON SEQUENCE status_history_id_seq, appointments_id_seq,
    appointment_slots_id_seq, notifications_id_seq, access_log_id_seq
    TO watiq_staff;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq, staff_id_seq,
    verification_codes_id_seq, staff_recovery_codes_id_seq
    TO watiq_auth;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO watiq_admin;

-- ------------------------------------------------------------
-- 7c. FUNCTION EXECUTE PRIVILEGES
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. For a
-- SECURITY DEFINER function that bypasses RLS, that means any connected role
-- can run it. fn_anonymize_user destroys a citizen's PII irreversibly, so it
-- must be revoked and re-granted deliberately.
-- ------------------------------------------------------------

-- fn_anonymize_user and fn_purge_expired_auth_artifacts are locked down at the
-- end of section 8, immediately after they are defined.

-- fn_staff_has_permission is SECURITY DEFINER but returns only a boolean and is
-- required by the RLS policies above, so the app roles keep EXECUTE.
REVOKE ALL ON FUNCTION fn_staff_has_permission(INTEGER, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_staff_has_permission(INTEGER, VARCHAR)
    TO watiq_citizen, watiq_staff, watiq_auth, watiq_auditor, watiq_admin;

-- The two SECURITY DEFINER trigger functions. Calling either outside a trigger
-- raises, so the exposure is small, but a SECURITY DEFINER routine should never
-- sit on the default PUBLIC grant.
REVOKE ALL ON FUNCTION fn_requests_before_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_sync_slot_booked_count() FROM PUBLIC;

-- ============================================================
-- 8. DATA RETENTION / RIGHT TO ERASURE
-- ============================================================

-- requests.user_id is ON DELETE RESTRICT, which correctly preserves the
-- administrative record but means a citizen can never be truly deleted.
-- Anonymize instead: strip the PII, keep the row.
--
-- CALLER CONTRACT: purge the citizen's objects from blob storage BEFORE
-- calling this; the document rows are removed here and the keys are then gone.
-- EXECUTE is restricted to watiq_admin in section 7c.
CREATE OR REPLACE FUNCTION fn_anonymize_user(
    p_user_id        INTEGER,
    p_reason         TEXT DEFAULT NULL,
    p_actor_staff_id INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND anonymized_at IS NULL) THEN
        RAISE EXCEPTION 'User % does not exist or is already anonymized', p_user_id;
    END IF;

    -- Record the erasure itself before the identifying data is gone.
    INSERT INTO access_log (staff_id, user_id, action, resource_type, resource_id, query_params)
    VALUES (p_actor_staff_id, p_user_id, 'anonymize', 'user', p_user_id,
            jsonb_build_object('reason', p_reason));

    -- Kill every active session first.
    UPDATE sessions
       SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'anonymization'
     WHERE user_id = p_user_id AND revoked_at IS NULL;

    DELETE FROM verification_codes WHERE user_id = p_user_id;

    -- Uploaded ID scans and their storage keys.
    DELETE FROM documents
     WHERE request_id IN (SELECT id FROM requests WHERE user_id = p_user_id);

    -- Form payloads carry name/address/CIN copies.
    UPDATE requests
       SET form_data = '{}'::jsonb,
           notes = NULL
     WHERE user_id = p_user_id;

    -- Notification bodies quote personal details.
    UPDATE notifications
       SET title = 'Redacted', message = 'Redacted'
     WHERE user_id = p_user_id;

    DELETE FROM user_steg_account WHERE user_id = p_user_id;

    -- Payment amounts stay (financial record); the bank references do not.
    UPDATE payments
       SET reference_number = NULL, transaction_id = NULL
     WHERE user_id = p_user_id;

    UPDATE users
       SET national_id           = NULL,
           first_name            = 'ANONYMIZED',
           last_name             = 'ANONYMIZED',
           email                 = NULL,
           phone                 = NULL,
           password_hash         = NULL,
           date_of_birth         = NULL,
           governorate           = NULL,
           city                  = NULL,
           address               = NULL,
           email_verified        = FALSE,
           phone_verified        = FALSE,
           is_active             = FALSE,
           deactivated_at        = COALESCE(deactivated_at, CURRENT_TIMESTAMP),
           anonymized_at         = CURRENT_TIMESTAMP,
           anonymization_reason  = p_reason
     WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION fn_anonymize_user IS 'Strips a citizen''s PII while preserving request/payment records for audit. watiq_admin only.';

-- Expired sessions and consumed OTPs are not worth keeping. Run from cron.
CREATE OR REPLACE FUNCTION fn_purge_expired_auth_artifacts()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM sessions
     WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
        OR (revoked_at IS NOT NULL AND revoked_at < CURRENT_TIMESTAMP - INTERVAL '30 days');

    DELETE FROM verification_codes
     WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
END;
$$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. For a
-- SECURITY DEFINER function that bypasses RLS, that means any connected role
-- can run it. fn_anonymize_user destroys a citizen's PII irreversibly, so the
-- default grant must be revoked and re-issued deliberately.
REVOKE ALL ON FUNCTION fn_anonymize_user(INTEGER, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_purge_expired_auth_artifacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_anonymize_user(INTEGER, TEXT, INTEGER) TO watiq_admin;
GRANT EXECUTE ON FUNCTION fn_purge_expired_auth_artifacts() TO watiq_admin;

-- ============================================================
-- 9. VIEWS
--
-- security_invoker = true is load-bearing, not decoration. Without it every
-- view runs with the owner's rights and returns every row in the country to
-- whoever is granted the view.
-- ============================================================

-- Staff/auditor queue view. Joins staff, so it is not granted to citizens.
CREATE OR REPLACE VIEW v_request_overview
WITH (security_invoker = true) AS
SELECT
    r.id,
    r.tracking_code,
    fn_mask_tail(u.national_id) AS national_id_masked,
    u.first_name || ' ' || u.last_name AS citizen_name,
    sc.name AS service_name,
    sc.name_fr AS service_name_fr,
    o.name AS office_name,
    o.governorate,
    rs.name AS status_name,
    rs.color AS status_color,
    p.name AS priority_name,
    st.name AS assigned_staff_name,
    r.assigned_staff_id,
    r.submitted_at,
    r.estimated_ready_date,
    r.completed_at,
    CASE
        WHEN r.completed_at IS NOT NULL THEN 'completed'
        WHEN r.estimated_ready_date < CURRENT_DATE THEN 'overdue'
        ELSE 'in_progress'
    END AS timeline_status
FROM requests r
JOIN users u ON r.user_id = u.id
JOIN office_services os ON r.office_service_id = os.id
JOIN service_catalog sc ON os.catalog_id = sc.id
JOIN offices o ON r.office_id = o.id
JOIN request_statuses rs ON r.status_id = rs.id
LEFT JOIN priorities p ON r.priority_id = p.id
LEFT JOIN staff st ON r.assigned_staff_id = st.id;

-- Citizen-facing "my requests" list. No staff join, no national_id.
CREATE OR REPLACE VIEW v_my_requests
WITH (security_invoker = true) AS
SELECT
    r.id,
    r.tracking_code,
    r.user_id,
    sc.name AS service_name,
    sc.name_fr AS service_name_fr,
    sc.slug AS service_slug,
    o.name AS office_name,
    o.governorate,
    o.city,
    rs.name AS status_name,
    rs.name_fr AS status_name_fr,
    rs.color AS status_color,
    rs.is_final,
    r.submitted_at,
    r.estimated_ready_date,
    r.completed_at
FROM requests r
JOIN office_services os ON r.office_service_id = os.id
JOIN service_catalog sc ON os.catalog_id = sc.id
JOIN offices o ON r.office_id = o.id
JOIN request_statuses rs ON r.status_id = rs.id;

-- Payments with bank references masked.
CREATE OR REPLACE VIEW v_payment_overview
WITH (security_invoker = true) AS
SELECT
    pay.id,
    pay.request_id,
    pay.user_id,
    pt.name AS payment_type,
    pm.name AS payment_method,
    pay.amount,
    pay.currency,
    pay.status,
    fn_mask_tail(pay.reference_number) AS reference_number_masked,
    fn_mask_tail(pay.transaction_id)   AS transaction_id_masked,
    pay.paid_at,
    pay.created_at
FROM payments pay
JOIN payment_types pt ON pay.type_id = pt.id
LEFT JOIN payment_methods pm ON pay.method_id = pm.id;

-- Office workload summary
CREATE OR REPLACE VIEW v_office_workload
WITH (security_invoker = true) AS
SELECT
    o.id AS office_id,
    o.name AS office_name,
    o.governorate,
    COUNT(DISTINCT r.id) AS total_requests,
    COUNT(DISTINCT CASE WHEN rs.is_final = FALSE THEN r.id END) AS pending_requests,
    COUNT(DISTINCT CASE WHEN r.assigned_staff_id IS NULL AND rs.is_final = FALSE THEN r.id END) AS unassigned_requests,
    COUNT(DISTINCT CASE WHEN r.estimated_ready_date < CURRENT_DATE AND rs.is_final = FALSE THEN r.id END) AS overdue_requests,
    COUNT(DISTINCT a.id) AS today_appointments
FROM offices o
LEFT JOIN requests r ON o.id = r.office_id
LEFT JOIN request_statuses rs ON r.status_id = rs.id
LEFT JOIN appointment_slots sl ON o.id = sl.office_id AND sl.slot_date = CURRENT_DATE
LEFT JOIN appointments a ON a.slot_id = sl.id AND a.status IN ('scheduled', 'completed')
GROUP BY o.id, o.name, o.governorate;

-- Remaining capacity per slot, for the booking UI.
CREATE OR REPLACE VIEW v_slot_availability
WITH (security_invoker = true) AS
SELECT
    sl.id AS slot_id,
    sl.office_id,
    o.name AS office_name,
    o.governorate,
    sl.office_service_id,
    sl.slot_date,
    sl.time_slot,
    sl.capacity,
    sl.booked_count,
    sl.capacity - sl.booked_count AS seats_left
FROM appointment_slots sl
JOIN offices o ON sl.office_id = o.id
WHERE sl.is_active = TRUE
  AND sl.slot_date >= CURRENT_DATE;

-- SEARCH RESULTS PAGE: one row per service in the country, however many
-- offices deliver it. This is the view the "find anything" search box hits.
CREATE OR REPLACE VIEW v_service_search
WITH (security_invoker = true) AS
SELECT
    sc.id AS catalog_id,
    sc.code,
    sc.slug,
    sc.name,
    sc.name_fr,
    sc.description,
    sc.description_fr,
    sc.required_documents,
    sc.base_fee,
    sc.currency,
    sc.processing_time,
    sc.is_digital,
    sc.legal_reference,
    sc.office_type,
    c.code AS category_code,
    c.name AS category_name,
    c.name_fr AS category_name_fr,
    COUNT(os.id) FILTER (WHERE os.is_available AND o.is_active) AS available_office_count,
    sc.search_document
FROM service_catalog sc
LEFT JOIN categories c ON sc.category_id = c.id
LEFT JOIN office_services os ON os.catalog_id = sc.id
LEFT JOIN offices o ON os.office_id = o.id
WHERE sc.is_active = TRUE
GROUP BY sc.id, c.code, c.name, c.name_fr;

COMMENT ON VIEW v_service_search IS
    'One row per national service. Search: WHERE search_document @@ websearch_to_tsquery(''simple'', $1); '
    'typo fallback: WHERE name_fr %> $1 ORDER BY name_fr <-> $1.';

-- SERVICE DETAIL PAGE: "where can I actually get this, and what will it cost
-- me there". Effective fee and SLA resolve the office override against the
-- national default in one place, so the app never re-implements that rule.
CREATE OR REPLACE VIEW v_service_availability
WITH (security_invoker = true) AS
SELECT
    os.id AS office_service_id,
    sc.id AS catalog_id,
    sc.slug AS service_slug,
    sc.name AS service_name,
    sc.name_fr AS service_name_fr,
    o.id AS office_id,
    o.name AS office_name,
    o.type AS office_type,
    o.governorate,
    o.city,
    o.address,
    o.phone,
    o.latitude,
    o.longitude,
    o.opening_hours,
    os.is_available,
    os.notes,
    COALESCE(os.fee_override, sc.base_fee)                      AS effective_fee,
    sc.currency,
    COALESCE(os.processing_time_override, sc.processing_time)   AS effective_processing_days,
    sc.is_digital
FROM office_services os
JOIN service_catalog sc ON os.catalog_id = sc.id
JOIN offices o ON os.office_id = o.id
WHERE sc.is_active = TRUE
  AND o.is_active = TRUE;

COMMENT ON VIEW v_service_availability IS
    'Service x office, with fee/SLA overrides already resolved. Order by distance '
    'from the citizen using latitude/longitude for "nearest office that does X".';

GRANT SELECT ON v_my_requests, v_payment_overview, v_slot_availability,
                v_service_search, v_service_availability TO watiq_citizen;
GRANT SELECT ON v_request_overview, v_payment_overview, v_office_workload,
                v_slot_availability, v_service_search, v_service_availability TO watiq_staff;
GRANT SELECT ON v_request_overview, v_payment_overview, v_office_workload
    TO watiq_auditor;

-- ============================================================
-- 10. SEED DATA
-- ============================================================

INSERT INTO roles (code, name, name_fr, description, sort_order) VALUES
('clerk',      'Clerk',      'Agent',      'Processes requests at the counter', 10),
('supervisor', 'Supervisor', 'Superviseur','Assigns work and approves requests', 20),
('director',   'Director',   'Directeur',  'Office-wide oversight and staff management', 30),
('national_auditor', 'National Auditor', 'Auditeur national',
                                           'Cross-office read-only oversight', 40),
('admin',      'Administrator', 'Administrateur', 'Full system administration', 50);

INSERT INTO permissions (code, name, description) VALUES
('request.view',            'View requests',            'Read requests within own office'),
('request.view_all_offices','View all offices',         'Read requests across every office'),
('request.assign',          'Assign requests',          'Set assigned_staff_id on a request'),
('request.update_status',   'Update request status',    'Move a request through the workflow'),
('request.approve',         'Approve requests',         'Set a request to approved'),
('request.reject',          'Reject requests',          'Set a request to rejected'),
('document.view',           'View documents',           'View uploaded document metadata'),
('document.download',       'Download documents',       'Obtain a signed URL for a document'),
('document.verify',         'Verify documents',         'Mark a document verified or rejected'),
('appointment.view',        'View appointments',        'Read the office appointment book'),
('appointment.manage',      'Manage appointments',      'Create, reschedule and cancel appointments'),
('slot.manage',             'Manage slots',             'Define bookable capacity for the office'),
('payment.view',            'View payments',            'Read payment records'),
('payment.refund',          'Refund payments',          'Modify or refund a payment record'),
('user.view',               'View citizen profiles',    'Read citizen personal data'),
('user.deactivate',         'Deactivate citizens',      'Suspend a citizen account'),
('user.anonymize',          'Anonymize citizens',       'Execute a right-to-erasure request'),
('staff.manage',            'Manage staff',             'Create, edit and deactivate staff accounts'),
('role.manage',             'Manage roles',             'Change role/permission assignments'),
('report.view',             'View reports',             'Access workload and performance reports'),
('audit.view',              'View audit logs',          'Read access_log and status_history');

-- clerk: counter work only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'clerk' AND p.code IN (
    'request.view', 'request.update_status',
    'document.view', 'document.verify',
    'appointment.view', 'appointment.manage',
    'payment.view', 'user.view'
);

-- supervisor: clerk + assignment, approval, downloads, reporting
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'supervisor' AND p.code IN (
    'request.view', 'request.update_status', 'request.assign',
    'request.approve', 'request.reject',
    'document.view', 'document.verify', 'document.download',
    'appointment.view', 'appointment.manage', 'slot.manage',
    'payment.view', 'user.view', 'report.view'
);

-- director: supervisor + payment changes, account lifecycle, staff, audit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'director' AND p.code IN (
    'request.view', 'request.update_status', 'request.assign',
    'request.approve', 'request.reject',
    'document.view', 'document.verify', 'document.download',
    'appointment.view', 'appointment.manage', 'slot.manage',
    'payment.view', 'payment.refund',
    'user.view', 'user.deactivate',
    'staff.manage', 'report.view', 'audit.view'
);

-- national_auditor: read-only, but across every office in the country
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'national_auditor' AND p.code IN (
    'request.view', 'request.view_all_offices',
    'document.view', 'appointment.view',
    'payment.view', 'user.view', 'report.view', 'audit.view'
);

-- admin: everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = 'admin';

-- Insert default request statuses
INSERT INTO request_statuses (code, name, name_fr, color, sort_order, is_final) VALUES
('submitted', 'Submitted', 'Soumis', '#3B82F6', 10, FALSE),
('under_review', 'Under Review', 'En cours d''examen', '#F59E0B', 20, FALSE),
('pending_docs', 'Pending Documents', 'Documents en attente', '#EF4444', 30, FALSE),
('approved', 'Approved', 'Approuvé', '#10B981', 40, FALSE),
('payment_required', 'Payment Required', 'Paiement requis', '#8B5CF6', 50, FALSE),
('processing', 'Processing', 'En traitement', '#6366F1', 60, FALSE),
('ready', 'Ready for Pickup', 'Prêt pour retrait', '#06B6D4', 70, FALSE),
('completed', 'Completed', 'Terminé', '#10B981', 80, TRUE),
('rejected', 'Rejected', 'Rejeté', '#EF4444', 90, TRUE),
('cancelled', 'Cancelled', 'Annulé', '#6B7280', 100, TRUE);

-- Insert default priorities
INSERT INTO priorities (code, name, name_fr, sort_order) VALUES
('normal', 'Normal', 'Normal', 10),
('urgent', 'Urgent', 'Urgent', 20),
('emergency', 'Emergency', 'Urgence', 30);

-- Insert default payment methods
INSERT INTO payment_methods (code, name, name_fr) VALUES
('e_dinar', 'E-Dinar', 'E-Dinar'),
('bank_transfer', 'Bank Transfer', 'Virement bancaire'),
('cash', 'Cash', 'Espèces'),
('credit_card', 'Credit Card', 'Carte bancaire');

-- Insert default payment types
INSERT INTO payment_types (code, name, name_fr) VALUES
('service_fee', 'Service Fee', 'Frais de service'),
('stamp_duty', 'Stamp Duty', 'Timbre fiscal'),
('fine', 'Fine', 'Amende'),
('tax', 'Tax', 'Taxe');

-- ------------------------------------------------------------
-- NATIONAL SERVICE CATALOGUE (starter set)
--
-- base_fee and legal_reference are deliberately left NULL: they are statutory
-- values and must be filled from the official texts (JORT) rather than guessed
-- here. The structure is what matters -- one row per service nationally, then
-- office_services rows saying who delivers it.
-- ------------------------------------------------------------

INSERT INTO categories (code, name, name_fr, sort_order) VALUES
('etat_civil',       'الحالة المدنية',      'État civil',        10),
('identite',         'الهوية',              'Identité',          20),
('transport',        'النقل',               'Transport',         30),
('fiscalite',        'الجباية',             'Fiscalité',         40),
('justice',          'العدالة',             'Justice',           50),
('urbanisme',        'التعمير',             'Urbanisme',         60),
('services_publics', 'الخدمات العمومية',    'Services publics',  70);

INSERT INTO service_catalog
    (code, slug, category_id, name, name_fr, description_fr, processing_time, is_digital, office_type)
SELECT v.code, v.slug, c.id, v.name, v.name_fr, v.description_fr,
       v.processing_time, v.is_digital, v.office_type
FROM (VALUES
    ('civil.birth_certificate',    'extrait-de-naissance',       'etat_civil',
     'شهادة ولادة', 'Extrait de naissance',
     'Copie officielle de l''acte de naissance délivrée par la municipalité.', 1, TRUE, 'municipality'),
    ('civil.marriage_certificate', 'extrait-acte-mariage',       'etat_civil',
     'عقد زواج', 'Extrait d''acte de mariage',
     'Copie officielle de l''acte de mariage.', 1, TRUE, 'municipality'),
    ('civil.death_certificate',    'extrait-acte-deces',         'etat_civil',
     'شهادة وفاة', 'Extrait d''acte de décès',
     'Copie officielle de l''acte de décès.', 1, TRUE, 'municipality'),
    ('civil.residence_certificate','certificat-de-residence',    'etat_civil',
     'شهادة إقامة', 'Certificat de résidence',
     'Attestation du lieu de résidence du citoyen.', 2, FALSE, 'municipality'),

    ('identity.cin_first',         'cin-premiere-demande',       'identite',
     'بطاقة تعريف وطنية - أول مرة', 'CIN — première demande',
     'Première délivrance de la carte d''identité nationale.', 21, FALSE, 'interior_ministry'),
    ('identity.cin_renewal',       'cin-renouvellement',         'identite',
     'تجديد بطاقة التعريف الوطنية', 'CIN — renouvellement',
     'Renouvellement de la carte d''identité nationale.', 14, FALSE, 'interior_ministry'),
    ('identity.passport',          'passeport-biometrique',      'identite',
     'جواز سفر بيومتري', 'Passeport biométrique',
     'Demande ou renouvellement du passeport biométrique.', 30, FALSE, 'interior_ministry'),

    ('transport.driving_licence',  'permis-de-conduire',         'transport',
     'رخصة سياقة', 'Permis de conduire',
     'Délivrance ou renouvellement du permis de conduire.', 30, FALSE, 'transport_agency'),
    ('transport.vehicle_reg',      'carte-grise',                'transport',
     'البطاقة الرمادية', 'Carte grise',
     'Certificat d''immatriculation du véhicule.', 15, FALSE, 'transport_agency'),

    ('tax.declaration',            'declaration-impot',          'fiscalite',
     'التصريح بالضريبة', 'Déclaration d''impôt',
     'Déclaration annuelle des revenus.', 1, TRUE, 'tax_office'),
    ('tax.quitus',                 'quitus-fiscal',              'fiscalite',
     'شهادة في الوضعية الجبائية', 'Quitus fiscal',
     'Attestation de situation fiscale régulière.', 7, FALSE, 'tax_office'),

    ('justice.criminal_record',    'bulletin-numero-3',          'justice',
     'بطاقة عدد 3', 'Extrait de casier judiciaire (B3)',
     'Bulletin n°3 du casier judiciaire.', 3, TRUE, 'court'),

    ('urbanism.building_permit',   'permis-de-batir',            'urbanisme',
     'رخصة بناء', 'Permis de bâtir',
     'Autorisation de construire délivrée par la municipalité.', 60, FALSE, 'municipality'),

    ('utility.steg_subscription',  'abonnement-steg',            'services_publics',
     'اشتراك الكهرباء والغاز', 'Abonnement STEG',
     'Souscription ou transfert d''un contrat électricité/gaz.', 5, TRUE, 'utility'),
    ('utility.sonede_subscription','abonnement-sonede',          'services_publics',
     'اشتراك الماء الصالح للشراب', 'Abonnement SONEDE',
     'Souscription ou transfert d''un contrat d''eau potable.', 5, TRUE, 'utility')
) AS v(code, slug, category_code, name, name_fr, description_fr,
       processing_time, is_digital, office_type)
JOIN categories c ON c.code = v.category_code;
