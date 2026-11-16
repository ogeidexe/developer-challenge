# Reference Migrations (SQL)

These files are the **reference SQL** of the physical model. The executed copies are the Flyway migrations
in `backend/src/main/resources/db/migration`:

| Reference file | Flyway migration | Contents | Differences in the Flyway copy |
|---|---|---|---|
| `001_users_cost_centers.sql` | `V1__users_cost_centers.sql` | `users`, `cost_centers` | no `CREATE EXTENSION pgcrypto` — `gen_random_uuid()` is built in since PostgreSQL 13, and the extension needs extra privileges |
| `002_budgets.sql` | `V2__budgets.sql` | `budgets` + unique (center, month) + `CHECK (consumed <= amount)` | — |
| `003_purchase_requests.sql` | `V3__purchase_requests.sql` | `purchase_requests`, `request_items`, sequence `sq_request_number` | — |
| `004_versions_steps.sql` | `V4__versions_steps.sql` | `request_versions` (frozen `cost_center_id`), `version_items`, `approval_steps` (6 statuses) | — |
| `005_events_immutability.sql` | `V5__events_immutability.sql` | `request_events` + immutability triggers on events, versions and version items | the `REVOKE … FROM purchase_app` runs only if that role exists (a plain `REVOKE` fails where it does not) |
| `006_idempotency.sql` | `V6__idempotency.sql` | `idempotency_keys` | — |

When the schema changes, change the Flyway copy with a **new** `V7__…` migration (never edit an applied
one) and update the reference file and `ERD-PHYSICAL.md` together.

## Seed (not a migration)

Passwords must be BCrypt-hashed, so the seed is Java code: `backend/.../config/DemoSeed.java`, an
`ApplicationRunner` enabled by `SEED_ENABLED=true` (default). It runs after Flyway on start-up and
creates the README §5.4 fixtures **through the real services**, so history, versions, steps and budget
consumption are genuine:

- 2 cost centers — `CC-TI-01` (R$ 50.000, of which R$ 49.200 consumed by an APPROVED request → R$ 800
  left, to demonstrate `BUDGET_EXCEEDED`) and `CC-ADM-02` (R$ 80.000, R$ 12.000 consumed);
- per center 1 `SOLICITANTE`, 1 `APROVADOR NIVEL_1`, 1 `APROVADOR NIVEL_2`; 2 global `ADMIN`s;
- 10 requests: draft, pending at N1 / N2 / ADMIN, changes requested (with an edited working copy),
  approved, rejected, cancelled, and a SOFTWARE request.

Idempotency: the whole seed runs in **one transaction** and is skipped when `admin1@kingspan.test`
already exists. A restart therefore never re-seeds, never half-seeds and never updates rows (the
immutability triggers would reject updates on versions/events). This replaces the per-row
"insert-if-absent" originally described in SPEC-002 — same guarantees, simpler code.

Credentials (all fictional, password `Kingspan@123`) are listed in `backend/README.md`; `SOLUTION.md`
(candidate-owned, not written yet) must repeat them.

## Operational rules

- Flyway runs automatically on back-end start-up (`spring.flyway.enabled=true`); Hibernate does not touch
  the schema (`ddl-auto: none`).
- Tests run the same migrations against a Testcontainers PostgreSQL and reset data with `TRUNCATE`
  (row-level triggers do not fire on `TRUNCATE`).
