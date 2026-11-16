-- 002_budgets.sql

CREATE TABLE budgets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cost_center_id  uuid NOT NULL REFERENCES cost_centers(id) ON DELETE RESTRICT,
    year_month      char(7) NOT NULL CHECK (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    amount_cents    bigint  NOT NULL CHECK (amount_cents >= 0),
    consumed_cents  bigint  NOT NULL DEFAULT 0 CHECK (consumed_cents >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_budgets_not_overdrawn CHECK (consumed_cents <= amount_cents)
);
CREATE UNIQUE INDEX ux_budgets_cc_month ON budgets (cost_center_id, year_month);

-- DOWN: DROP TABLE budgets;
