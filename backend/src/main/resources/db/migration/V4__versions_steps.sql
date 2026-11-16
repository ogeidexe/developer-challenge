-- V4 (source: docs/database/migrations/004)
-- Immutable snapshots + frozen items + ordered approval steps.

CREATE TABLE request_versions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id       uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
    version_number   integer      NOT NULL CHECK (version_number > 0),
    title            varchar(120) NOT NULL,
    description      text NULL,
    category         varchar(20)  NOT NULL,
    cost_center_id   uuid         NOT NULL REFERENCES cost_centers(id) ON DELETE RESTRICT,
    needed_by        date NULL,
    total_cents      bigint       NOT NULL CHECK (total_cents >= 0),
    competence_month char(7)      NOT NULL CHECK (competence_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    submitted_by     uuid         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_versions_req_n ON request_versions (request_id, version_number);
-- cost_center_id is part of the snapshot (A-28): a working-copy CC change can never re-attribute
-- a frozen version's budget.

CREATE TABLE version_items (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id        uuid NOT NULL REFERENCES request_versions(id) ON DELETE CASCADE,
    position          smallint NOT NULL CHECK (position >= 0),
    description       varchar(255) NOT NULL,
    quantity          integer NOT NULL CHECK (quantity > 0),
    unit_price_cents  bigint  NOT NULL CHECK (unit_price_cents > 0),
    line_total_cents  bigint  NOT NULL CHECK (line_total_cents = quantity * unit_price_cents)
);
CREATE UNIQUE INDEX ux_vitems_ver_pos ON version_items (version_id, position);

CREATE TABLE approval_steps (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id   uuid NOT NULL REFERENCES request_versions(id) ON DELETE CASCADE,
    sequence     smallint    NOT NULL CHECK (sequence > 0),
    level        varchar(20) NOT NULL CHECK (level IN ('NIVEL_1','NIVEL_2','ADMIN')),
    status       varchar(20) NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','APPROVED','REJECTED','RETURNED','CANCELLED','SKIPPED')),
    approver_id  uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
    decided_at   timestamptz NULL,
    comment      text NULL
);
CREATE UNIQUE INDEX ux_steps_ver_seq ON approval_steps (version_id, sequence);
-- Concurrency guard is APPLICATION-side (ADR-009, TRANSACTION-STRATEGY §3.3): steps are always updated with
--   UPDATE approval_steps ... WHERE id = :id AND status = 'PENDING'
-- 0 rows -> someone decided first -> 409. A partial unique index on (version_id, sequence)
-- WHERE status='APPROVED' was REMOVED: the base unique index already makes duplicate
-- (version, sequence) rows impossible, so it guarded nothing.

