# Transaction Strategy

> Scope: PostgreSQL 16 (READ COMMITTED default), Spring `@Transactional` + Spring Data JPA / Hibernate
> (implementation: `backend/.../application`, `backend/.../persistence`). Every multi-write operation runs in an
> explicit transaction whose boundary is the application-service method (ADR-008). Justification for
> isolation levels and lock choices: ADR-009.

## 1. Principles

1. **One transition = one transaction.** `submit`, `approve`, `reject`, `request-changes`, `cancel` each wrap
   (aggregate update + step update + event insert + optional budget update) in a single `BEGIN…COMMIT`.
   Partial writes are impossible; any exception rolls back everything **except** the intentional
   `APPROVAL_FAILED_BUDGET` audit path (§4).
2. **Reads never take locks.** List/detail/inbox/dashboard are plain snapshots.
3. **Writes take the minimum lock that guarantees the invariant** — optimistic version column on the
   aggregate, row lock via conditional `UPDATE` on the budget.
4. **Isolation level: READ COMMITTED everywhere.** Invariants are enforced by predicate conditions evaluated
   on the *latest committed* row (optimistic version / conditional balance update), which is stronger and
   cheaper here than SERIALIZABLE retry loops — see ADR-009 §Consequences.

## 2. Transaction boundaries

| Operation | Boundary | Writes inside the tx |
|---|---|---|
| `POST /auth/register`, `POST /auth/login` | none (single statements) | user insert (register) |
| `POST /requests` (create, idempotency-keyed) | service method | **idempotency placeholder INSERT first** + request + items + event + key response UPDATE — one atomic commit |
| `PUT /requests/:id` (edit) | service method | aggregate lock UPDATE (first) + items (wholesale replace) + event |
| `POST /requests/:id/submit` | service method | aggregate lock UPDATE (first) + version + version_items + steps + request(status, current_version) + event |
| `POST /requests/:id/approve` (intermediate) | service method | aggregate lock UPDATE (first) + step(APPROVED, `WHERE status='PENDING'`) + event |
| `POST /requests/:id/approve` (final) | service method | aggregate lock UPDATE (**first**) → conditional budget UPDATE → step(APPROVED) + request(status=APPROVED, decided_at) + event. Budget failure → full rollback; failure event written in a separate tx (§4) |
| `POST /requests/:id/reject` | service method | aggregate lock UPDATE (first) + current step(REJECTED) + later steps(SKIPPED) + request(status, decided_at) + event |
| `POST /requests/:id/request-changes` | service method | aggregate lock UPDATE (first) + current step(RETURNED) + later steps(SKIPPED) + request(status) + event |
| `POST /requests/:id/cancel` | service method | aggregate lock UPDATE (first) + (from `PENDING_APPROVAL` only) current step(CANCELLED) + later steps(SKIPPED) + request(status, decided_at) + event. From `DRAFT` there are no steps; from `CHANGES_REQUESTED` the version's steps are already closed |
| `PUT /cost-centers/:id/budgets/:yyyy-mm` | service method | upsert budget (locked read of consumed) + no event (admin ops are not request-audited) |

## 3. Locking recipes

### 3.1 Optimistic aggregate lock (all transitions) — FIRST WRITE

The first write **only claims the aggregate** — it bumps `lock_version` and nothing else, because the
outcome (e.g. whether a final approval ends `APPROVED`) is not known until the rules and the budget have
been evaluated:

```sql
-- (1) FIRST write of every transition / edit transaction: claim the row
UPDATE purchase_requests
SET lock_version = lock_version + 1,
    updated_at   = now()
WHERE id = :id AND lock_version = :expectedLock
RETURNING lock_version;
-- 0 rows -> throw CONCURRENCY_CONFLICT (409) with currentLockVersion

-- ... state machine, policies, comment, budget (final approve), step updates ...

-- (2) LAST write to the aggregate, same transaction, only after every check passed
UPDATE purchase_requests
SET status          = :newStatus,
    current_version = :currentVersion,   -- submit only
    total_cents     = :totalCents,       -- submit / edit only
    submitted_at    = :submittedAt,      -- submit only
    decided_at      = :decidedAt,        -- APPROVED / REJECTED / CANCELLED only
    updated_at      = now()
WHERE id = :id;                          -- row already locked by (1); no version predicate needed
```

- (1) is the **first write** of the transaction. Under READ COMMITTED, a competing UPDATE that had to
  wait on the row lock re-evaluates its `WHERE` on the winner's committed row and gets 0 rows. This is
  what guarantees the README's rule: two simultaneous approvals of the **same step** → exactly one
  succeeds, the other gets **409** — even when the step is the final one and the budget is nearly
  exhausted (a budget-first order would hand the loser 422; see §4 and ADR-009).
- The guard runs **before** business rules (BR-014): stale `lockVersion` → `409` without evaluating
  the state machine, eligibility, or budget.
- The business rules are evaluated on the aggregate loaded at the start of the request. That snapshot
  is guaranteed current: (1) succeeded only because `lock_version` still equals the expected value, and
  every change to the request or its steps bumps `lock_version`. While the transaction is open, the row
  lock from (1) keeps any other writer out.
- If any rule fails after (1), the transaction rolls back and the lock bump is never persisted.
- **Implementation:** (1) is `PurchaseRequestRepository.claim` — a JPQL `@Modifying(clearAutomatically = true)`
  update that returns the row count instead of `RETURNING`; `RequestLock.claim` first compares the loaded
  `lockVersion` (cheap early 409), runs the update, reads the current value for the 409 body when 0 rows
  matched, and re-reads the request. The entity maps `lock_version` as read-only, so Hibernate never
  writes it. (2) is Hibernate dirty checking on the re-read entity, flushed at the end of the service method.

### 3.2 Atomic budget consumption (final approval only)

Runs **after** the aggregate lock is secured (§3.1):

```sql
UPDATE budgets
SET consumed_cents = consumed_cents + :amountCents,
    updated_at = now()
WHERE cost_center_id = :ccId          -- the VERSION's frozen cost center (A-28)
  AND year_month = :competenceMonth   -- the VERSION's stamped competence month
  AND consumed_cents + :amountCents <= amount_cents;
-- 0 rows -> DomainError BUDGET_EXCEEDED (missing month OR insufficient balance)
```

- The `UPDATE` itself acquires the row lock, so concurrent finals serialize on the budget row.
- After the holder commits, the next transaction's `WHERE` re-evaluates against the **committed** value —
  the predicate is re-checked against the latest row version, so losers get 0 rows → `422`.
- `CHECK (consumed_cents <= amount_cents)` is the last line of defense against any application bug.

### 3.3 Step decision guard (approve / reject / return)

Steps are always decided with a status-conditional UPDATE — the row itself is the guard:

```sql
UPDATE approval_steps
SET status = :newStatus,              -- 'APPROVED' | 'REJECTED' | 'RETURNED' | 'CANCELLED'
    approver_id = :approverId,
    decided_at = now(),
    comment = :comment
WHERE id = :stepId AND status = 'PENDING';
-- 0 rows -> someone decided this step first -> 409 CONCURRENCY_CONFLICT

-- reject / request-changes / cancel only, same transaction: close the rest of the chain
UPDATE approval_steps
SET status = 'SKIPPED'
WHERE version_id = :versionId AND status = 'PENDING' AND sequence > :currentSequence;
```

Invariant (A-31): once a version stops being the active chain, none of its steps is `PENDING`.

> **Removed** (ADR-009): the partial unique index `UNIQUE(version_id, sequence) WHERE
> status='APPROVED'`. The base `UNIQUE(version_id, sequence)` already makes duplicate rows impossible,
> so the partial index guarded nothing a row update could violate. `DUPLICATE_APPROVER` intentionally has
> no DB backstop — segregation is per-version and evaluated under the aggregate lock, which serializes
> the check (see ADR-009).

### 3.4 Idempotency key reservation (POST /requests)

The key is reserved **in the same transaction as the create** (A-32, ADR-010), so a committed request
never exists without its key row:

```sql
-- inside the create transaction, as the FIRST write:
INSERT INTO idempotency_keys (user_id, idem_key, endpoint, payload_hash, response_status, response_body, created_at, expires_at)
VALUES (:userId, :key, 'POST /requests', :payloadHash, 102, '{}'::jsonb, now(), now() + interval '24 hours')
ON CONFLICT (user_id, idem_key) DO UPDATE
    SET payload_hash    = EXCLUDED.payload_hash,
        response_status = EXCLUDED.response_status,
        response_body   = EXCLUDED.response_body,
        created_at      = EXCLUDED.created_at,
        expires_at      = EXCLUDED.expires_at
    WHERE idempotency_keys.expires_at < now()      -- only an EXPIRED row may be taken over
RETURNING user_id;
-- 1 row  -> key reserved (fresh, or expired row taken over) -> continue
-- 0 rows -> a LIVE record exists (concurrent creator committed while we waited on the PK lock)
--           -> ROLLBACK, then SELECT the committed record -> replay (hash match) or 409 (mismatch)

-- ... create aggregate + items + event ...
UPDATE idempotency_keys SET response_status = :status, response_body = :body
WHERE user_id = :userId AND idem_key = :key;
-- single COMMIT: request row and key row land atomically
```

- **Why `ON CONFLICT` and not "catch the unique violation":** in PostgreSQL any error aborts the
  current transaction (`current transaction is aborted, commands ignored until end of transaction
  block`), so a re-`SELECT` after a caught unique violation cannot run in the same transaction.
  `ON CONFLICT … RETURNING` turns the race into a row count instead of an error.
- **Why `DO UPDATE … WHERE expires_at < now()`:** an expired record still occupies the primary key, so
  a plain insert could never reuse it. The conditional `DO UPDATE` takes over only expired rows; a live
  row yields 0 rows (the `WHERE` filters the update out).
- Concurrency: the loser's `INSERT` waits on the winner's uncommitted PK entry. If the winner commits,
  the loser gets 0 rows and replays it; if the winner rolls back, the loser's insert proceeds.
- Key reuse with a different payload hash is detected on the pre-tx `SELECT` or on the post-rollback
  `SELECT` → `409 IDEMPOTENCY_PAYLOAD_MISMATCH`. Expired rows are also purged lazily.

## 4. The BUDGET_EXCEEDED path (rollback + separate audit transaction)

On final-step approval with insufficient balance, the *state* must remain `PENDING_APPROVAL`
(README §2.3.5) and no trace of the attempt may survive inside the transition transaction (not even
the lock bump). Recipe:

1. Transition tx: aggregate lock UPDATE (first write) → policies → conditional budget UPDATE → 0 rows.
2. **`ROLLBACK` the entire transition transaction** — lock bump, any step change, all undone.
3. **New, short transaction:** `INSERT request_events (action='APPROVAL_FAILED_BUDGET', to_status='PENDING_APPROVAL', …)`; commit.
4. Throw `BUDGET_EXCEEDED` → `422` with available/required values.

Why not commit the event inside the failed transition (ADR-009; README §2.3.5): committing implies the lock
bump survives, so a racing second approver would get 409 only by luck — and on a request that just
became APPROVED by the winner, the failure event would be a false audit trail. Rollback-first keeps the
machine honest: the loser of a same-step race always gets 409; only a genuine single-party budget
failure produces the event, in its own transaction.

## 5. Failure and recovery matrix

| Failure point | State after rollback/retry | Client sees |
|---|---|---|
| Validation (400) | unchanged | `400` + `errors[]` |
| Not visible (404) | unchanged | `404` |
| Wrong role (403) | unchanged | `403 FORBIDDEN` |
| Not the owner (403) | unchanged | `403 NOT_REQUEST_OWNER` |
| Stale lock (409) | unchanged (first writer committed) | `409 CONCURRENCY_CONFLICT` |
| Invalid transition (422) | unchanged | `422 INVALID_TRANSITION` |
| Policy violation (422) | unchanged | specific code |
| Budget exceeded (422) | unchanged — transition fully rolled back; failure event committed in its own tx | `422 BUDGET_EXCEEDED` |
| DB crash mid-tx | full rollback | `500` (retry safe except non-idempotent transitions — see §6) |

## 6. Transactional idempotency of transitions (boundary note)

Transition endpoints are **not** idempotency-keyed (README scopes keys to `POST /requests`). Retrying a
`submit/approve/…` after an ambiguous timeout is still safe in practice: the retry carries the same
`lockVersion`, which the first (committed) attempt bumped → the retry deterministically receives `409` and the
client refreshes state. This is documented as the differentiator FR-24's minimal viable behavior.
