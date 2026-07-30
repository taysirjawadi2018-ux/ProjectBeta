-- ============================================================
-- WATIQ DATABASE SCHEMA
-- Digitizing Paper-Based Government Procedures in Tunisia
-- ============================================================

-- Enable UUID extension if needed (PostgreSQL)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. REFERENCE / LOOKUP TABLES
-- ============================================================

-- Categories of government services
CREATE TABLE categories (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    name_fr         VARCHAR(255),           -- French localization
    icon            VARCHAR(255),           -- Icon URL or class name
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

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
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,

    CONSTRAINT uq_offices_name_governorate UNIQUE (name, governorate, city)
);

COMMENT ON TABLE offices IS 'Government offices where citizens submit requests';
CREATE INDEX idx_offices_governorate ON offices(governorate);
CREATE INDEX idx_offices_city ON offices(city);
CREATE INDEX idx_offices_type ON offices(type);
CREATE INDEX idx_offices_is_active ON offices(is_active);
CREATE INDEX idx_offices_location ON offices(latitude, longitude);

-- Priority levels for requests
CREATE TABLE priorities (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,
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
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    name_fr         VARCHAR(100),
    color           VARCHAR(7) DEFAULT '#6B7280',  -- Hex color for UI
    sort_order      INTEGER DEFAULT 0,
    is_final        BOOLEAN DEFAULT FALSE,         -- Terminal status (completed/rejected)

    CONSTRAINT uq_request_statuses_code UNIQUE (code),
    CONSTRAINT chk_request_statuses_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

COMMENT ON TABLE request_statuses IS 'Workflow statuses for requests (submitted, under_review, completed, etc.)';
CREATE INDEX idx_request_statuses_sort_order ON request_statuses(sort_order);
CREATE INDEX idx_request_statuses_is_final ON request_statuses(is_final);

-- Payment types (fees, fines, taxes)
CREATE TABLE payment_types (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    name_fr         VARCHAR(255),

    CONSTRAINT uq_payment_types_code UNIQUE (code)
);

COMMENT ON TABLE payment_types IS 'Types of payments (service_fee, fine, stamp_duty, etc.)';

-- Payment methods
CREATE TABLE payment_methods (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) NOT NULL UNIQUE,
    name            VARCHAR(100) NOT NULL,
    name_fr         VARCHAR(100),

    CONSTRAINT uq_payment_methods_code UNIQUE (code)
);

COMMENT ON TABLE payment_methods IS 'Available payment channels (bank_transfer, e-dinar, cash, etc.)';

-- ============================================================
-- 2. CORE ENTITY TABLES
-- ============================================================

-- Registered citizens
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    national_id     VARCHAR(20) NOT NULL UNIQUE,    -- Tunisian CIN
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(20),
    password_hash   VARCHAR(255),                   -- For citizen portal login
    date_of_birth   DATE,
    governorate     VARCHAR(100),
    city            VARCHAR(100),
    address         TEXT,
    email_verified  BOOLEAN DEFAULT FALSE,
    phone_verified  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_national_id UNIQUE (national_id),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_phone UNIQUE (phone),
    CONSTRAINT chk_users_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_users_date_of_birth CHECK (date_of_birth <= CURRENT_DATE)
);

COMMENT ON TABLE users IS 'Citizens registered in the Watiq platform';
CREATE INDEX idx_users_national_id ON users(national_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_governorate ON users(governorate);

-- Government staff / civil servants
CREATE TABLE staff (
    id              SERIAL PRIMARY KEY,
    office_id       INTEGER NOT NULL,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    role            VARCHAR(100) NOT NULL  CHECK (role IN ('clerk','supervisor','director','admin') ,    -- e.g., 'clerk', 'supervisor', 'director'
    password_hash   VARCHAR(255) NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    CONSTRAINT fk_staff_office 
        FOREIGN KEY (office_id) REFERENCES offices(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT uq_staff_email UNIQUE (email)
);

COMMENT ON TABLE staff IS 'Government employees who process requests';
CREATE INDEX idx_staff_office_id ON staff(office_id);
CREATE INDEX idx_staff_role ON staff(role);
CREATE INDEX idx_staff_is_active ON staff(is_active);

-- Available services per office
CREATE TABLE services (
    id                  SERIAL PRIMARY KEY,
    office_id           INTEGER NOT NULL,
    category_id         INTEGER,
    name                VARCHAR(255) NOT NULL,
    name_fr             VARCHAR(255),
    slug                VARCHAR(255),               -- URL-friendly identifier
    description         TEXT,
    required_documents  JSONB,                      -- Array of required doc types
    fees                JSONB,                      -- Fee structure
    processing_time     INTEGER,                    -- Estimated days
    is_digital          BOOLEAN DEFAULT FALSE,      -- Fully digital workflow?
    is_available        BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    CONSTRAINT fk_services_office 
        FOREIGN KEY (office_id) REFERENCES offices(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_services_category 
        FOREIGN KEY (category_id) REFERENCES categories(id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT uq_services_slug UNIQUE (slug)
);

COMMENT ON TABLE services IS 'Government services offered by offices';
CREATE INDEX idx_services_office_id ON services(office_id);
CREATE INDEX idx_services_category_id ON services(category_id);
CREATE INDEX idx_services_is_available ON services(is_available);
CREATE INDEX idx_services_is_digital ON services(is_digital);

-- ============================================================
-- 3. TRANSACTIONAL TABLES
-- ============================================================

-- Citizen requests / applications
CREATE TABLE requests (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL,
    service_id          INTEGER NOT NULL,
    office_id           INTEGER NOT NULL,
    status_id           INTEGER NOT NULL,
    priority_id         INTEGER,
    form_data           JSONB NOT NULL DEFAULT '{}',    -- Dynamic form responses
    tracking_code       VARCHAR(50) NOT NULL UNIQUE,    -- Public tracking number
    submitted_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estimated_ready_date DATE,
    completed_at        TIMESTAMP,
    notes               TEXT,                           -- Internal notes by staff
    updated_at      TIMESTAMP,
    assigned_staff_id SERIAL,
    CONSTRAINT fk_requests_staff 
        FOREIGN KEY (assigned_staff_id) REFERENCES staff(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_requests_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_requests_service 
        FOREIGN KEY (service_id) REFERENCES services(id) 
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
    CONSTRAINT uq_requests_tracking_code UNIQUE (tracking_code),
    CONSTRAINT chk_requests_completed_after_submitted 
        CHECK (completed_at IS NULL OR completed_at >= submitted_at)
);

COMMENT ON TABLE requests IS 'Citizen service requests / applications';
CREATE INDEX idx_requests_user_id ON requests(user_id);
CREATE INDEX idx_requests_service_id ON requests(service_id);
CREATE INDEX idx_requests_office_id ON requests(office_id);
CREATE INDEX idx_requests_status_id ON requests(status_id);
CREATE INDEX idx_requests_priority_id ON requests(priority_id);
CREATE INDEX idx_requests_tracking_code ON requests(tracking_code);
CREATE INDEX idx_requests_submitted_at ON requests(submitted_at);
CREATE INDEX idx_requests_estimated_ready ON requests(estimated_ready_date);

-- Uploaded documents for requests
CREATE TABLE documents (
    id              SERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL,
    file_url        VARCHAR(500) NOT NULL,        -- Storage path or URL
    document_type   VARCHAR(100) NOT NULL,      -- e.g., 'cin_copy', 'birth_certificate'
    status          VARCHAR(50) DEFAULT 'pending', -- pending, verified, rejected
    uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_documents_request 
        FOREIGN KEY (request_id) REFERENCES requests(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_documents_status CHECK (status IN ('pending', 'verified', 'rejected'))
);

COMMENT ON TABLE documents IS 'Documents uploaded by citizens for their requests';
CREATE INDEX idx_documents_request_id ON documents(request_id);
CREATE INDEX idx_documents_status ON documents(status);

-- Request status history (audit trail)
CREATE TABLE status_history (
    id              SERIAL PRIMARY KEY,
    request_id      INTEGER NOT NULL,
    old_status_id   INTEGER,
    new_status_id   INTEGER NOT NULL,
    changed_by      INTEGER,                    -- Staff member who changed it
    changed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    request_id          INTEGER,
    user_id             INTEGER NOT NULL,
    office_id           INTEGER NOT NULL,
    service_id          INTEGER NOT NULL,
    appointment_date    DATE NOT NULL,
    time_slot           VARCHAR(20) NOT NULL,       -- e.g., '09:00-10:00'
    status              VARCHAR(50) DEFAULT 'scheduled', -- scheduled, completed, cancelled, no_show
    queue_number        VARCHAR(20),                -- Physical queue ticket
    reason              TEXT,                       -- Purpose of visit
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_appointments_request 
        FOREIGN KEY (request_id) REFERENCES requests(id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_appointments_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_appointments_office 
        FOREIGN KEY (office_id) REFERENCES offices(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_appointments_service 
        FOREIGN KEY (service_id) REFERENCES services(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_appointments_status CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'))
);

COMMENT ON TABLE appointments IS 'Scheduled appointments for in-person visits';
CREATE INDEX idx_appointments_request_id ON appointments(request_id);
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_office_id ON appointments(office_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Notifications to citizens
CREATE TABLE notifications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    request_id      INTEGER,
    type            VARCHAR(50) NOT NULL,       -- e.g., 'status_change', 'appointment_reminder'
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    is_read         BOOLEAN DEFAULT FALSE,
    sent_via        VARCHAR(20) DEFAULT 'push', -- push, email, sms
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

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
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
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
    currency            VARCHAR(3) DEFAULT 'TND',
    transaction_id      VARCHAR(255),               -- External payment gateway ID
    status              VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, refunded
    paid_at             TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

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
    CONSTRAINT chk_payments_paid_after_created CHECK (paid_at IS NULL OR paid_at >= created_at)
);

COMMENT ON TABLE payments IS 'Financial transactions for government services';
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
    is_primary      BOOLEAN DEFAULT FALSE,
    added_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_steg_account_user 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_user_steg_contract UNIQUE (contract_number),
    CREATE UNIQUE INDEX uq_one_primary_steg_per_user ON user_steg_account(user_id) WHERE is_primary = TRUE;
);  

COMMENT ON TABLE user_steg_account IS 'Linked STEG (Tunisian Electricity/Gas) accounts';
CREATE INDEX idx_user_steg_account_user_id ON user_steg_account(user_id);

-- ============================================================
-- 4. VIEWS (Optional but recommended)
-- ============================================================

-- Request overview with current status
CREATE OR REPLACE VIEW v_request_overview AS
SELECT 
    r.id,
    r.tracking_code,
    u.national_id,
    u.first_name || ' ' || u.last_name AS citizen_name,
    s.name AS service_name,
    o.name AS office_name,
    rs.name AS status_name,
    rs.color AS status_color,
    p.name AS priority_name,
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
JOIN services s ON r.service_id = s.id
JOIN offices o ON r.office_id = o.id
JOIN request_statuses rs ON r.status_id = rs.id
LEFT JOIN priorities p ON r.priority_id = p.id;

-- Office workload summary
CREATE OR REPLACE VIEW v_office_workload AS
SELECT 
    o.id AS office_id,
    o.name AS office_name,
    COUNT(DISTINCT r.id) AS total_requests,
    COUNT(DISTINCT CASE WHEN rs.is_final = FALSE THEN r.id END) AS pending_requests,
    COUNT(DISTINCT CASE WHEN r.estimated_ready_date < CURRENT_DATE AND rs.is_final = FALSE THEN r.id END) AS overdue_requests,
    COUNT(DISTINCT a.id) AS today_appointments
FROM offices o
LEFT JOIN requests r ON o.id = r.office_id
LEFT JOIN request_statuses rs ON r.status_id = rs.id
LEFT JOIN appointments a ON o.id = a.office_id AND a.appointment_date = CURRENT_DATE
GROUP BY o.id, o.name;

-- ============================================================
-- 5. SEED DATA (Optional)
-- ============================================================

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
