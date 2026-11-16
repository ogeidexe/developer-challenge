-- V1: users and cost centers (source: docs/database/migrations/001). gen_random_uuid() is built in since PG 13.
-- Users and cost centers. PostgreSQL 16.


CREATE TABLE cost_centers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        varchar(30)  NOT NULL,
    name        varchar(120) NOT NULL,
    active      boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_cost_centers_code ON cost_centers (code);

CREATE TABLE users (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email          varchar(255) NOT NULL,
    password_hash  text         NOT NULL,
    name           varchar(120) NOT NULL CHECK (char_length(name) >= 2),
    role           varchar(20)  NOT NULL CHECK (role IN ('SOLICITANTE','APROVADOR','ADMIN')),
    approver_level varchar(20)  NULL CHECK (approver_level IN ('NIVEL_1','NIVEL_2')),
    cost_center_id uuid NULL REFERENCES cost_centers(id) ON DELETE RESTRICT,
    active         boolean      NOT NULL DEFAULT true,
    lock_version   integer      NOT NULL DEFAULT 1,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_email ON users (email);
CREATE INDEX ix_users_cost_center ON users (cost_center_id);
-- business invariant (application-enforced, documented): approver_level NOT NULL iff role='APROVADOR'

