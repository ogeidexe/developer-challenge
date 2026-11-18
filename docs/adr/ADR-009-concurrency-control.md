# ADR-009 — Concurrency Control: Hybrid Optimistic + Atomic Conditional Writes

**Status:** Accepted (mandated by README §5.1: "Controle de concorrência otimista ou pessimista, à sua escolha, justificada em ADR") · reviewed 2026-11-18 against the implementation
**Date:** 2026-11-15

## Context
README §2.3.5 requires: simultaneous approvals of the same step → exactly one succeeds, the other gets
`409`; simultaneous final approvals sharing a balance → balance never negative, losers get
`422 BUDGET_EXCEEDED`. Every transition also requires the client-held `lockVersion` (§3.2).

## Problem
Pick one mechanism and justify it, knowing two different hazards must be covered.

## Options Considered
1. **Pessimistic everywhere** (`SELECT … FOR UPDATE` on the aggregate for all transitions).
2. **Optimistic everywhere** (`lock_version` on the aggregate; budget consumption via read-check-write).
3. **Hybrid:** optimistic version column on `purchase_requests` + atomic conditional UPDATE on `budgets`.

## Decision
Option 3.
- Aggregate: `UPDATE … WHERE id=:id AND lock_version=:expected` — the **first write** of the transition
  transaction (0 rows → 409 `CONCURRENCY_CONFLICT` with `currentLockVersion`). Locking first is what
  guarantees the README's same-step rule: two simultaneous approvals of the same step → exactly one
  succeeds, the other gets **409** — even on the final step with a nearly-exhausted budget, where a
  budget-check-first order would surface 422 and a false audit event.
- Budget: `UPDATE budgets SET consumed_cents = consumed_cents + :x WHERE … AND consumed_cents + :x <= amount_cents`
  — runs only after the lock is secured; the UPDATE row-locks the budget row until commit; queued
  transactions re-evaluate the predicate on the committed value. 0 rows → 422 `BUDGET_EXCEEDED`.
  Backstop: `CHECK (consumed_cents <= amount_cents)`.
- Step decisions: `UPDATE approval_steps SET status=… WHERE id=:id AND status='PENDING'` — 0 rows means
  someone decided first → 409. (The initially sketched partial unique index `UNIQUE(version_id, sequence)
  WHERE status='APPROVED'` was removed: the base unique index already prevents duplicate (version,
  sequence) rows, so it guarded nothing a row update could violate.)
- Isolation: READ COMMITTED (default). Invariants are enforced by predicates on latest committed rows,
  which is exactly the semantics needed — SERIALIZABLE would add retry storms (predicate locks on
  ranges) with no gain: the contended row is single and the predicate is row-local.

## Rationale
Pessimistic locking of the aggregate would serialize *all* work on a request (including reads of other
steps' state) and risks lock-holder failures needing timeouts; optimistic gives the required 409
semantics naturally and scales reads. For the budget, optimistic versions would allow lost updates
(check-then-act races) — only the atomic conditional write guarantees never-negative under concurrency.
The README's "otimista ou pessimista" choice is thus resolved per hazard: optimistic for the aggregate,
pessimistic (via UPDATE locks) for the balance.

## Consequences
- 409 responses always precede business-rule evaluation (BR-14 stage 4) — the lock guard is the first
  write, and on budget failure the transition rolls back entirely (the `APPROVAL_FAILED_BUDGET` audit
  event commits in a separate short transaction, so no lock bump or false event survives a race).
- CT-01 (incl. the final-step-low-budget variant), CT-02, CT-04 and CT-06 provide automated proof.

## Trade-offs
Clients must handle 409 by refetching (front-end contract); budget row contention serializes finals on
one center — acceptable per challenge scale (and correct by design).

## Implementation
- Lock claim: `PurchaseRequestRepository.claim` (JPQL `@Modifying(clearAutomatically = true)`), called by
  `application/RequestLock` as the first write of every transition and edit.
- Budget: `BudgetRepository.consume` (native conditional UPDATE); admin PUT uses
  `BudgetRepository.lockByCostCenterAndMonth` (`@Lock(PESSIMISTIC_WRITE)`).
- Steps: `ApprovalStepRepository.decide` / `skipAfter` (status-guarded JPQL updates).
- Rollback-then-audit: `TransitionFacade` + `AuditService.recordBudgetFailure` (`REQUIRES_NEW`).
- Proof: `ConcurrencyIntegrationTest` (same step → one 200 + one 409, repeated 5×; same final step with
  R$ 800 left → 409 not 422, repeated 5×; five R$ 3.000 finals on R$ 10.000 → exactly three approved, balance
  never negative), run by CI on every push.
- End to end: the Cypress checklist items NFR-01 and NFR-02 fire the two approvals at the same time from the
  browser (`Promise.all`) against the real stack — one `200` + one `409 CONCURRENCY_CONFLICT`; one `200` + one
  `422 BUDGET_EXCEEDED` with the balance never negative. Both passed against a deployed compose stack on
  2026-11-17.
- Decided steps are also protected by the database since `V7` (trigger `trg_approval_steps_guard`).

## Related Specifications
SPEC-008, SPEC-011, SPEC-013; ADR-004, ADR-008; TRANSACTION-STRATEGY.md §3.
