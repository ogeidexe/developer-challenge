-- 005_events_immutability.sql
-- Append-only audit trail + snapshot immutability.
-- Triggers (not only REVOKE) enforce immutability: the application role typically OWNS the tables
-- (it runs the migrations), so REVOKE against itself would be a no-op (DATA-003/DATA-004, ADR-004).
-- The trigger raises on any UPDATE/DELETE attempt, including from the table owner.

CREATE TABLE request_events (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id     uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE RESTRICT,
    actor_id       uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_role     varchar(20) NOT NULL,
    action         varchar(40) NOT NULL,
    from_status    varchar(20) NULL,
    to_status      varchar(20) NULL,
    step_level     varchar(20) NULL,
    step_sequence  smallint NULL,
    version_number integer  NOT NULL DEFAULT 0,
    comment        text NULL,
    x_request_id   varchar(64) NOT NULL,
    occurred_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_events_request ON request_events (request_id, occurred_at, id);

CREATE OR REPLACE FUNCTION fn_no_update_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is immutable (append-only snapshot)', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_events_append_only
BEFORE UPDATE OR DELETE ON request_events
FOR EACH ROW EXECUTE FUNCTION fn_no_update_delete();

CREATE TRIGGER trg_versions_immutable
BEFORE UPDATE OR DELETE ON request_versions
FOR EACH ROW EXECUTE FUNCTION fn_no_update_delete();

CREATE TRIGGER trg_version_items_immutable
BEFORE UPDATE OR DELETE ON version_items
FOR EACH ROW EXECUTE FUNCTION fn_no_update_delete();

-- Defense-in-depth REVOKE for non-owner roles (harmless when it is a no-op):
REVOKE UPDATE, DELETE ON request_events FROM purchase_app;
REVOKE UPDATE, DELETE ON request_versions FROM purchase_app;
REVOKE UPDATE, DELETE ON version_items FROM purchase_app;

-- DOWN: DROP TRIGGER trg_events_append_only ON request_events;
--       DROP TRIGGER trg_versions_immutable ON request_versions;
--       DROP TRIGGER trg_version_items_immutable ON version_items;
--       DROP FUNCTION fn_no_update_delete; DROP TABLE request_events;
