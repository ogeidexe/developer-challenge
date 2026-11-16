# Physical ERD (PostgreSQL 16)

> Implemented by the Flyway migrations `backend/src/main/resources/db/migration/V1`–`V6` (reference SQL in
> `docs/database/migrations/`) and mapped by the JPA entities in `backend/.../persistence`. All timestamps
> are `timestamptz` (stored UTC, NFR-005; Hibernate `jdbc.time_zone=UTC`, Java `Instant`). All money
> columns are `bigint` cents (DATA-005). UUIDs: `gen_random_uuid()` (built in since PostgreSQL 13; the
> entities also generate UUIDs). Enums are `varchar` + `CHECK`, mapped with `@Enumerated(EnumType.STRING)`.
> Foreign keys are mapped as plain UUID attributes (no JPA associations).

## 1. `users`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| email | varchar(255) | NO | — | UNIQUE; `CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')` |
| password_hash | text | NO | — | bcrypt/argon2 output; never exposed |
| name | varchar(120) | NO | — | `CHECK (char_length(name) >= 2)` |
| role | varchar(20) | NO | — | `CHECK (role IN ('SOLICITANTE','APROVADOR','ADMIN'))` |
| approver_level | varchar(20) | YES | NULL | `CHECK (approver_level IN ('NIVEL_1','NIVEL_2'))`; business rule: NOT NULL iff role='APROVADOR' |
| cost_center_id | uuid | YES | NULL | FK → cost_centers(id) ON DELETE RESTRICT; NULL ⇒ global admin |
| active | boolean | NO | true | — |
| lock_version | integer | NO | 1 | optimistic, admin edits |
| created_at | timestamptz | NO | now() | — |
| updated_at | timestamptz | NO | now() | — |

**Indexes:** `ux_users_email` UNIQUE (email); `ix_users_cost_center` (cost_center_id) — inbox/join support.

## 2. `cost_centers`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| code | varchar(30) | NO | — | UNIQUE, e.g. `CC-TI-01` |
| name | varchar(120) | NO | — | — |
| active | boolean | NO | true | — |
| created_at / updated_at | timestamptz | NO | now() | — |

## 3. `budgets`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| cost_center_id | uuid | NO | — | FK → cost_centers(id) ON DELETE RESTRICT |
| year_month | char(7) | NO | — | `CHECK (year_month ~ '^\d{4}-(0[1-9]\|1[0-2])$')` |
| amount_cents | bigint | NO | — | `CHECK (amount_cents >= 0)` |
| consumed_cents | bigint | NO | 0 | `CHECK (consumed_cents >= 0)`; app+DB invariant `consumed_cents <= amount_cents` enforced by conditional UPDATE and by `CHECK (consumed_cents <= amount_cents)` |
| created_at / updated_at | timestamptz | NO | now() | — |

**Indexes:** `ux_budgets_cc_month` UNIQUE (cost_center_id, year_month) — doubles as the consumption lookup; `ix_budgets_expiry` not needed.

**Concurrency note:** consumption uses `UPDATE budgets SET consumed_cents = consumed_cents + $1 WHERE id=$2 AND consumed_cents + $1 <= amount_cents`, which row-locks and re-evaluates atomically (see TRANSACTION-STRATEGY.md §3).

## 4. `purchase_requests`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| request_number | varchar(20) | NO | — | UNIQUE, format `REQ-` + zero-padded sequence (DB sequence `sq_request_number`) |
| owner_id | uuid | NO | — | FK → users(id) ON DELETE RESTRICT |
| cost_center_id | uuid | NO | — | FK → cost_centers(id) ON DELETE RESTRICT |
| status | varchar(20) | NO | 'DRAFT' | `CHECK (status IN ('DRAFT','PENDING_APPROVAL','CHANGES_REQUESTED','APPROVED','REJECTED','CANCELLED'))` |
| current_version | integer | NO | 0 | `CHECK (current_version >= 0)`; count of frozen versions |
| lock_version | integer | NO | 1 | optimistic lock on every transition |
| title | varchar(120) | NO | — | `CHECK (char_length(title) >= 3)` |
| description | text | YES | NULL | — |
| category | varchar(20) | NO | — | `CHECK (category IN ('EQUIPMENT','SERVICES','SUPPLIES','TRAVEL','SOFTWARE','OTHER'))` |
| needed_by | date | YES | NULL | future-date validated in domain (BR-012) |
| total_cents | bigint | NO | 0 | `CHECK (total_cents >= 0)`; working-copy total = current-version total after submit (deliberate denormalization, ERD-LOGICAL §R3) |
| submitted_at | timestamptz | YES | NULL | last submission instant |
| decided_at | timestamptz | YES | NULL | terminal-state instant |
| created_at / updated_at | timestamptz | NO | now() | — |

**Indexes:**
- `ix_req_owner_status` (owner_id, status) — requester list/dashboard
- `ix_req_cc_status` (cost_center_id, status) — approver list/dashboard
- `ix_req_created` (created_at DESC) — default sort + createdFrom/To
- `ix_req_category` (category), `ix_req_total` (total_cents) — filters
- `ix_req_pending` (status) WHERE status = 'PENDING_APPROVAL' — partial index powering list/inbox

## 5. `request_items` (working copy)

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| request_id | uuid | NO | — | FK → purchase_requests(id) ON DELETE CASCADE |
| position | smallint | NO | — | `CHECK (position >= 0)`; UNIQUE (request_id, position) |
| description | varchar(255) | NO | — | non-empty |
| quantity | integer | NO | — | `CHECK (quantity > 0)` |
| unit_price_cents | bigint | NO | — | `CHECK (unit_price_cents > 0)` |
| line_total_cents | bigint | NO | — | `CHECK (line_total_cents = quantity * unit_price_cents)` — immutable line math |

**Indexes:** `ux_items_req_pos` UNIQUE (request_id, position); `ix_items_request` (request_id).

## 6. `request_versions`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| request_id | uuid | NO | — | FK → purchase_requests(id) ON DELETE RESTRICT; UNIQUE (request_id, version_number) |
| version_number | integer | NO | — | `CHECK (version_number > 0)` |
| title | varchar(120) | NO | — | snapshot |
| description | text | YES | NULL | snapshot |
| category | varchar(20) | NO | — | snapshot |
| cost_center_id | uuid | NO | — | **frozen snapshot** FK → cost_centers(id) ON DELETE RESTRICT; budget consumption charges THIS center (A-28) |
| needed_by | date | YES | NULL | snapshot |
| total_cents | bigint | NO | — | `CHECK (total_cents >= 0)` |
| competence_month | char(7) | NO | — | `CHECK` same pattern as budgets; stamped in America/Sao_Paulo at submit |
| submitted_by | uuid | NO | — | FK → users(id) ON DELETE RESTRICT |
| submitted_at | timestamptz | NO | now() | frozen at submit |

**Immutability:** no UPDATE/DELETE grants for the application role and a `BEFORE UPDATE OR DELETE`
trigger on all three immutable tables — `request_events`, `request_versions`, `version_items`
(migration 005) — so immutability holds even though the application role owns the tables (plain REVOKE
alone would be a no-op for the owner; DATA-003, ADR-004). Application code has no update path.
**Indexes:** `ux_versions_req_n` UNIQUE (request_id, version_number); `ix_versions_request` (request_id).

## 7. `version_items`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| version_id | uuid | NO | — | FK → request_versions(id) ON DELETE CASCADE |
| position | smallint | NO | — | `CHECK (position >= 0)`; UNIQUE (version_id, position) |
| description | varchar(255) | NO | — | — |
| quantity | integer | NO | — | `CHECK (quantity > 0)` |
| unit_price_cents | bigint | NO | — | `CHECK (unit_price_cents > 0)` |
| line_total_cents | bigint | NO | — | `CHECK (line_total_cents = quantity * unit_price_cents)` |

## 8. `approval_steps`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | PK |
| version_id | uuid | NO | — | FK → request_versions(id) ON DELETE CASCADE |
| sequence | smallint | NO | — | `CHECK (sequence > 0)`; UNIQUE (version_id, sequence) |
| level | varchar(20) | NO | — | `CHECK (level IN ('NIVEL_1','NIVEL_2','ADMIN'))` |
| status | varchar(20) | NO | 'PENDING' | `CHECK (status IN ('PENDING','APPROVED','REJECTED','RETURNED','CANCELLED','SKIPPED'))` — reject marks the current step REJECTED; request-changes RETURNED; cancel (from PENDING_APPROVAL) CANCELLED; later steps of the version SKIPPED in the same tx (A-31) |
| approver_id | uuid | YES | NULL | FK → users(id) ON DELETE RESTRICT |
| decided_at | timestamptz | YES | NULL | set with the decision |
| comment | text | YES | NULL | optional on approve; mandatory (≥10 chars) on reject/return per CommentPolicy |

**Indexes:**
- `ux_steps_ver_seq` UNIQUE (version_id, sequence)
- Concurrency guard (replaces the removed partial unique index — see review note): the application always
  updates a step with `UPDATE approval_steps SET status='APPROVED', … WHERE id=:id AND status='PENDING'`;
  0 affected rows ⇒ someone decided first ⇒ mapped to `409`. (The old
  `UNIQUE(version_id, sequence) WHERE status='APPROVED'` index guarded nothing: the base unique index
  already prevents duplicate (version, sequence) rows, and a single row updated twice cannot violate it.)
- `DUPLICATE_APPROVER` has no DB backstop by design: segregation is per-version and evaluated under the
  aggregate lock, which serializes the check.

## 9. `request_events`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| id | bigint | NO | GENERATED ALWAYS AS IDENTITY | PK |
| request_id | uuid | NO | — | FK → purchase_requests(id) ON DELETE RESTRICT |
| actor_id | uuid | YES | NULL | FK → users(id) ON DELETE RESTRICT; NULL ⇒ system |
| actor_role | varchar(20) | NO | — | role as seen at action time |
| action | varchar(40) | NO | — | e.g. `REQUEST_CREATED`, `SUBMITTED`, `RESUBMITTED`, `APPROVED`, `APPROVAL_FAILED_BUDGET`, `REJECTED`, `CHANGES_REQUESTED`, `CANCELLED`, `EDITED` |
| from_status | varchar(20) | YES | NULL | — |
| to_status | varchar(20) | YES | NULL | — |
| step_level | varchar(20) | YES | NULL | — |
| step_sequence | smallint | YES | NULL | — |
| version_number | integer | NO | 0 | version context (0 = never submitted) |
| comment | text | YES | NULL | — |
| x_request_id | varchar(64) | NO | — | correlation id of the HTTP request |
| occurred_at | timestamptz | NO | now() | UTC instant of the action |

**Indexes:** `ix_events_request` (request_id, occurred_at, id) — timeline order.
**Immutability:** migration 005 revokes UPDATE/DELETE and installs an append-only trigger on
`request_events` (as well as on `request_versions` and `version_items`). Rows are inserted by the
application only.

## 10. `idempotency_keys`

| Column | Type | Null | Default | Constraints |
|---|---|---|---|---|
| user_id | uuid | NO | — | FK → users(id) ON DELETE CASCADE; PK (user_id, idem_key) |
| idem_key | varchar(255) | NO | — | PK (user_id, idem_key) |
| endpoint | varchar(64) | NO | — | e.g. `POST /requests` |
| payload_hash | char(64) | NO | — | sha256 of canonical JSON payload |
| response_status | integer | NO | — | stored HTTP status of first execution |
| response_body | jsonb | NO | — | stored response body of first execution |
| created_at | timestamptz | NO | now() | — |
| expires_at | timestamptz | NO | — | created_at + 24 h (NFR-022) |

**Indexes:** PK index serves lookup; `ix_idem_expiry` (expires_at) for the lazy purge job.

## 11. Sequences

| Sequence | Purpose |
|---|---|
| `sq_request_number` | `request_number` = `REQ-` || lpad(nextval, 6, '0') — human-friendly, gap-tolerant |

## 12. Referential behavior summary

| FK | On delete | Rationale |
|---|---|---|
| users.cost_center_id → cost_centers | RESTRICT | never orphan users |
| budgets.cost_center_id → cost_centers | RESTRICT | financial data preserved |
| purchase_requests.owner_id / cost_center_id → … | RESTRICT | audit anchors immutable |
| request_items.request_id → purchase_requests | CASCADE | working copy lifecycle |
| request_versions.request_id → purchase_requests | RESTRICT | versions preserved; requests are never hard-deleted (no DELETE endpoint) |
| version_items.version_id → request_versions | CASCADE | snapshot lifecycle |
| approval_steps.version_id → request_versions | CASCADE | chain lifecycle |
| request_events.request_id / actor_id → … | RESTRICT | append-only audit |
| idempotency_keys.user_id → users | CASCADE | hygiene |

**Soft deletion:** `users.active` and `cost_centers.active` flags provide deactivation without breaking FKs; requests have no soft delete — terminal states are the lifecycle end.

## 13. Migration order

1. `V1__users_cost_centers` — users, cost_centers
2. `V2__budgets`
3. `V3__purchase_requests` (+ items, sequence)
4. `V4__versions_steps` (+ version items, approval steps)
5. `V5__events_immutability` (+ triggers; conditional REVOKE)
6. `V6__idempotency`
7. Seed — `DemoSeed` (Java, after Flyway; BCrypt hashes, so it is **not** a SQL migration — see `migrations/README.md`)

Flyway records applied migrations in `flyway_schema_history`; applied migrations are never edited.
There are no down migrations (Flyway Community applies forward only).
