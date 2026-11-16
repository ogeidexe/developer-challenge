-- V7 — security hardening (docs/security/FINDINGS.md).

-- SEC-F06: e-mail uniqueness is case-insensitive at the database, not only in the application
-- (existsByEmailIgnoreCase). Without it, two concurrent sign-ups as "Ana@x" and "ana@x" both pass the
-- application check; afterwards findByEmailIgnoreCase returns two rows and that login fails with a 500.
CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email));

-- SEC-F07: a decided approval step is part of the audit trail. The application only ever updates a step
-- while it is PENDING (UPDATE ... WHERE status = 'PENDING'); this trigger makes the database refuse any later
-- change to a decision (who, when, outcome, comment), any change of a step's identity, and any delete.
-- Row triggers do not fire on TRUNCATE, which the integration tests use to reset the schema.
CREATE OR REPLACE FUNCTION fn_approval_step_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'approval_steps rows cannot be deleted (audit trail)';
    END IF;
    IF OLD.status <> 'PENDING' THEN
        RAISE EXCEPTION 'approval step % is already % and immutable', OLD.id, OLD.status;
    END IF;
    IF NEW.version_id <> OLD.version_id OR NEW.sequence <> OLD.sequence OR NEW.level <> OLD.level THEN
        RAISE EXCEPTION 'approval step % : version, sequence and level are immutable', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_approval_steps_guard
BEFORE UPDATE OR DELETE ON approval_steps
FOR EACH ROW EXECUTE FUNCTION fn_approval_step_guard();
