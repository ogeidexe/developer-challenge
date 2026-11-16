-- 006_idempotency.sql
-- Idempotency records for POST /requests (NFR-022, DATA-007).

CREATE TABLE idempotency_keys (
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    idem_key         varchar(255) NOT NULL,
    endpoint         varchar(64)  NOT NULL,
    payload_hash     char(64)     NOT NULL,
    response_status  integer      NOT NULL,
    response_body    jsonb        NOT NULL,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    expires_at       timestamptz  NOT NULL,
    PRIMARY KEY (user_id, idem_key)
);
CREATE INDEX ix_idem_expiry ON idempotency_keys (expires_at);

-- Lazy purge (run opportunistically on insert, e.g. nightly chance or per-request 1/1000):
-- DELETE FROM idempotency_keys WHERE expires_at < now();

-- DOWN: DROP TABLE idempotency_keys;
