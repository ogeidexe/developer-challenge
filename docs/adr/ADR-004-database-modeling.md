# ADR-004 — Database Modeling: Constraints as Business Rules

**Status:** Accepted
**Date:** 2026-11-15

## Context
The challenge grades consistency under concurrency (15%) and audit traceability; the internal-audit
framing (README §1) demands durable guarantees, not application promises.

## Problem
Decide how much of the business rule set belongs in the database schema itself.

## Options Considered
1. **Schema-first:** CHECKs, unique constraints, partial indexes, revokes for every durable rule;
   application validates for message quality only.
2. **Application-first:** constraints minimal (PK/FK), all rules in code.
3. Hybrid with trigger-heavy enforcement.

## Decision
Option 1, moderately: all monetary CHECKs, transition-relevant uniques (steps, versions, budgets,
idempotency), the overdraw CHECK and the append-only revokes/trigger live in the DB; the application
validates first to produce BR-15-quality messages (409/422 instead of 500 constraint errors).

## Rationale
README §6 lists DB-enforced append-only history as a differentiator — the audit premise justifies it as
standard. Races (same-step double approval, overdraw, duplicate idempotent create) must survive
application bugs; only DB constraints do. CHECK/UNIQUE are cheap and declarative; triggers are limited to
the single append-only rule where REVOKE alone is insufficient (table owner).

## Consequences
Migrations carry real semantics (the reference SQL in `docs/database/migrations/` is executed as Flyway
`V1`–`V6` in `backend/src/main/resources/db/migration`); integration tests must run on real
PostgreSQL (no substitutes) — which the test strategy already requires. Immutability relies on **triggers,
not only REVOKE**: the application role typically owns the tables (it runs the migrations), so a REVOKE
against itself is a no-op — the `BEFORE UPDATE OR DELETE` trigger on `request_events`,
`request_versions` and `version_items` is the actual enforcement (DATA-003/DATA-004, A-16).

## Trade-offs
Schema evolves via migrations only; minor developer friction; constraint-violation mapping must be
maintained (`GlobalExceptionHandler` turns an unexpected `DataIntegrityViolationException` into a 409);
the raw statements are few and documented (claim, budget consumption, step decision, idempotency).

## Related Specifications
SPEC-002, SPEC-011, SPEC-012, SPEC-013; ADR-009, ADR-011.
