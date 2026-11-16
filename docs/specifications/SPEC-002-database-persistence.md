# SPEC-002 — Database & Persistence

## 1. Specification Metadata
- **ID:** SPEC-002 · **Feature:** Database schema, migrations, seed · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (4–6 h) · **Dependencies:** SPEC-001 · **Wave:** 1
- **Responsible agent:** AGENT-SPEC-002 · **Status:** implemented — Flyway `V1`–`V6`, JPA entities, repositories and `DemoSeed`; drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
The physical foundation for every invariant: 10 tables, constraints that encode business rules
(non-negative money, unique steps, immutable snapshots/audit), the two locking recipes, and the
seed that makes the demo/evaluation flow work out of the box (README §5.4).

## 3. Scope
**In (as built):** Spring Data JPA / Hibernate configuration; Flyway `V1`–`V6` from `docs/database/migrations/*.sql`;
entities + repositories; Spring `@Transactional`; `DemoSeed`; `/health` DB check via Actuator (SPEC-014).
**Out:** domain repositories wiring (per-spec); auth tables (none needed beyond `users`).

## 4. Requirements
NFR-002 · NFR-003 · NFR-005 · NFR-006 (tx infra) · NFR-009 · DATA-003 · DATA-004 · DATA-005 · DATA-007 ·
INF-001 · FR-063 (health db part) · QA-003 (harness: Testcontainers config)

## 5. Business Rules
- Migration `V5` installs `BEFORE UPDATE OR DELETE` triggers on `request_events`, `request_versions` and `version_items` (the real enforcement — the app role owns the tables) and revokes UPDATE/DELETE from `purchase_app` only if that role exists.
- Money columns are `bigint` cents; check constraints from ERD-PHYSICAL are transcribed verbatim.
- Seed restart-safety (as built, deviation D-03): the whole seed runs in **one transaction** and is skipped
  when `admin1@kingspan.test` already exists — it never re-seeds, never half-seeds and never updates rows
  (the migration-`V5` triggers would reject updates of versions/events). The originally planned per-row
  `ON CONFLICT DO NOTHING` was replaced by this simpler scheme with the same guarantees.

## 6. Architecture (as implemented)
- Flyway migrations `backend/src/main/resources/db/migration/V1`–`V6` (from `docs/database/migrations/`); Hibernate `ddl-auto: none`.
- JPA entities in `persistence` (FKs as plain UUID columns; versions, version items and events `@Immutable`); Spring Data repositories, with the concurrency statements as explicit methods (`claim`, `consume`, `decide`, `skipAfter`, `deleteByRequestId`).
- Transactions: Spring `@Transactional` on service methods (ADR-008) — no custom decorator.
- Seed: `config.DemoSeed` (`ApplicationRunner`, `SEED_ENABLED`), built through the real services, one transaction, skipped when `admin1@kingspan.test` exists (deviation D-03; see `database/migrations/README.md`).
- **Seed accounting (A-33):** `CC-TI-01` consumption (R$ 49.200,00) and `CC-ADM-02` consumption (R$ 12.000,00) come from seeded APPROVED requests; the > R$ 10.000 demo request lives in `CC-ADM-02`.
- Integration tests: Testcontainers `postgres:16-alpine` via `@ServiceConnection` (`TestcontainersConfiguration`).

## 7. API Contract
None new; enables all persistence. `/health` reports `db: UP/DOWN`.

## 8. Database Impact
**Is** the database impact. Tables: `users`, `cost_centers`, `budgets`, `purchase_requests`,
`request_items`, `request_versions`, `version_items`, `approval_steps`, `request_events`,
`idempotency_keys` + sequence `sq_request_number` — exactly as `docs/database/ERD-PHYSICAL.md`.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 TypeORM config + migrations runner wiring | app boots against empty PG | compose `db` healthy |
| T02 Transcribe migrations 001–002 | users/cost_centers/budgets exist | migration test re-run idempotent |
| T03 Transcribe 003–004 | requests/items/versions/steps | schema diff vs ERD = ∅ |
| T04 Transcribe 005–006 (+ trigger/revokes) | immutability + idempotency schema | pg `\z` shows revoked rights |
| T05 Transaction decorator + EM propagation | nested repo calls join one tx | UT with spy |
| T06 Testcontainers harness for jest | integration suite boots PG | IT-08 |
| T07 Seed script (README §5.4 fixtures) | seed runs idempotent | seed rerun → no dupes |

## 10. Testing Strategy
- Migration tests: run all up → schema matches ERD-PHYSICAL (introspection assertions); run down cleanly.
- Constraint tests: negative money rejected; duplicate (cc, month) rejected; step decision with `WHERE status='PENDING'` on an already-decided row affects 0 rows; UPDATE/DELETE on `request_events`, `request_versions`, `version_items` rejected by trigger; UPDATE request_events fails.
- Seed idempotency: run twice, row counts stable, **no error** (the second run must not touch the
  immutable tables); also run the seed after approving a seeded request and assert the approval survives.

## 11. Acceptance Criteria
- **G**iven a fresh database **W**hen the backend boots **T**hen all 6 migrations apply and the seed creates exactly the §5.4 fixtures.
- **G**iven an application connection **W**hen it tries `UPDATE request_events …` **T**hen PostgreSQL denies it (append-only, DATA-004).
- **G**iven two budgets rows for the same center/month **W**hen the second inserts **T**hen it fails the unique constraint.

## 12. Integration Requirements
Every repository adapter (SPEC-004…013) depends on the table shapes and tx decorator defined here — no column renames without updating all dependent specs.

## 13. Risks
Revoke-grant assumptions (role name `purchase_app`) may not match compose credentials — align via env. Trigger ownership in migrations runs as table owner — fine for challenge scale.

## 14. Definition of Done
Migrations + seed run automatically from the container entrypoint; integration harness green; schema introspection test passes; AI-logged changes.
