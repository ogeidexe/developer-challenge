# SPEC-013 — Idempotency & Concurrency Control

## 1. Specification Metadata
- **ID:** SPEC-013 · **Feature:** Idempotency-Key handling + optimistic lock enforcement · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (4–6 h) · **Dependencies:** SPEC-006 (create), SPEC-008 (transitions) · **Wave:** 3
- **Responsible agent:** AGENT-SPEC-013 · **Status:** implemented — drafted in `backend/` — not yet compiled or run; CT-05/CT-06 race tests missing

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
Two everyday hazards: the user double-submits the create form, and two approvers click simultaneously.
README §3.2: `POST /requests` honors `Idempotency-Key` (24 h, replay semantics, 409 on payload mismatch);
every transition requires the current `lockVersion` and mismatches get `409`.

## 3. Scope
**In (as built):** `IdempotencyService` for `POST /requests` (look-up → hash compare → replay / mismatch 409 → reserve the key in the create transaction → store the response); canonical SHA-256 payload hash; expiry + `IdempotencyPurgeJob`; `RequestLock` (409 + `currentLockVersion`); unified 409 mapping in `GlobalExceptionHandler`.
unified 409 mapping (concurrency vs idempotency).
**Out:** transition-action idempotency keys (FR-024 [D] — documented extension point only).

## 4. Requirements
FR-021 (409 side) · NFR-021 · NFR-022 · NFR-024 · DATA-007 · BR-014 (409 stage)

## 5. Business Rules
- Idempotency scoped per (user, key); same payload ⇒ replay stored response verbatim (status + body); different payload ⇒ `409 IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Records expire after 24 h; expired keys behave as absent (overwrite path) — never auto-purged synchronously except cheap lazy deletes.
- **The key is reserved in the same transaction as the create** (A-32): placeholder INSERT first; racing creators collide on the PK `UNIQUE(user_id, idem_key)`; the reservation is `INSERT … ON CONFLICT (user_id, idem_key) DO UPDATE … WHERE expires_at < now() RETURNING` (TRANSACTION-STRATEGY §3.4), so the loser gets **0 rows** instead of an error, rolls back, re-reads, and replays the winner's record (a caught unique violation would abort the PostgreSQL transaction). The same statement takes over an expired key. Request row and key row commit atomically — no post-hoc "discard" is ever needed.
- `lockVersion` is required on every transition/edit body; missing ⇒ 400; stale ⇒ 409 with `currentLockVersion` (the lock guard is the aggregate's conditional UPDATE, the first write of the tx).

## 6. Architecture (as implemented)
`application.IdempotencyService` (`JdbcClient`): look-up → replay/409; otherwise one `TransactionTemplate` transaction that reserves the key with `INSERT … ON CONFLICT … DO UPDATE … WHERE expires_at < now() RETURNING`, creates the request and stores the response JSON; replays answer `Idempotent-Replayed: true`. `IdempotencyPurgeJob` (`@Scheduled`) deletes expired keys. Optimistic concurrency: `application.RequestLock` + `PurchaseRequestRepository.claim` (no separate guard component); `lockVersion` is required in `RequestDtos.TransitionInput` / `RequestUpdateInput` (missing → 400).

## 7. API Contract
Behavioral contract on `createRequest` + all transitions (see ERROR-CATALOG 409 rows). Header:
`Idempotency-Key` (optional, ≤255 chars).

## 8. Database Impact
Table `idempotency_keys` (SPEC-002). Writes: insert/replace row per first execution; purge deletes expired.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Canonical JSON hasher (stable key order) | util | unit |
| T02 `IdempotencyStore` + `ON CONFLICT` race handling | adapter | unit |
| T03 `IdempotencyInterceptor` (replay/mismatch/record) | interceptor | IT-09 |
| T04 `LockVersionGuard` wiring on transitions/edit | guard | CT-04 |
| T05 Lazy purge + expiry behavior | maintenance | unit |
| T06 Race tests (parallel same-key creates) | suite | CT-05 |

## 10. Testing Strategy
Integration: retry ⇒ identical 201 body, one row in `purchase_requests`; different payload same key ⇒ 409;
parallel same-key ⇒ one request total; expired key reusable. Concurrency: stale-lock edit/approve ⇒ 409
with current value; two simultaneous approves (CT-01) exactly one success.

## 11. Acceptance Criteria
- **G**iven a create with key K succeeded but the response was lost **W**hen the client retries K with the same payload **T**then the exact stored 201 body returns and no second request exists.
- **G**iven two approvers approving the same step concurrently with valid locks **W**hen both commit **T**hen exactly one 200; the other gets 409 and the step shows the first approver.

## 12. Integration Requirements
`IdempotencyService` is used only by `RequestController.create` — no other POST is keyed. `currentLockVersion` extension field is part of the frozen problem+json contract.

## 13. Risks
Response-body storage growth (no size cap implemented; expired rows are purged hourly); canonicalization bugs — the hash is built from a fixed field order with prices normalized to cents (no dedicated test yet).

## 14. Definition of Done
IT-09, CT-01, CT-04, CT-05 green; idempotency never creates duplicates under racing clients; AI-logged.
