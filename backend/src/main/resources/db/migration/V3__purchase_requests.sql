-- V3 (source: docs/database/migrations/003)
-- Aggregate root + working copy items + human-friendly number sequence.

CREATE SEQUENCE sq_request_number START 1;

CREATE TABLE purchase_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number  varchar(20) NOT NULL,
    owner_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    cost_center_id  uuid NOT NULL REFERENCES cost_centers(id) ON DELETE RESTRICT,
    status          varchar(20) NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','PENDING_APPROVAL','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED')),
    current_version integer     NOT NULL DEFAULT 0 CHECK (current_version >= 0),
    lock_version    integer     NOT NULL DEFAULT 1,
    title           varchar(120) NOT NULL CHECK (char_length(title) >= 3),
    description     text NULL,
    category        varchar(20) NOT NULL
                    CHECK (category IN ('EQUIPMENT','SERVICES','SUPPLIES','TRAVEL','SOFTWARE','OTHER')),
    needed_by       date NULL,
    total_cents     bigint NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
    submitted_at    timestamptz NULL,
    decided_at      timestamptz NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_requests_number ON purchase_requests (request_number);
CREATE INDEX ix_req_owner_status ON purchase_requests (owner_id, status);
CREATE INDEX ix_req_cc_status    ON purchase_requests (cost_center_id, status);
CREATE INDEX ix_req_created      ON purchase_requests (created_at DESC);
CREATE INDEX ix_req_category     ON purchase_requests (category);
CREATE INDEX ix_req_total        ON purchase_requests (total_cents);
CREATE INDEX ix_req_pending      ON purchase_requests (status) WHERE status = 'PENDING_APPROVAL';

CREATE TABLE request_items (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id        uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
    position          smallint NOT NULL CHECK (position >= 0),
    description       varchar(255) NOT NULL,
    quantity          integer    NOT NULL CHECK (quantity > 0),
    unit_price_cents  bigint     NOT NULL CHECK (unit_price_cents > 0),
    line_total_cents  bigint     NOT NULL CHECK (line_total_cents = quantity * unit_price_cents)
);
CREATE UNIQUE INDEX ux_items_req_pos ON request_items (request_id, position);
CREATE INDEX ix_items_request ON request_items (request_id);

