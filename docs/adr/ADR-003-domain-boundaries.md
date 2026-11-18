# ADR-003 — Domain Boundaries & Aggregates

**Status:** Accepted · reviewed 2026-11-18 against the implementation
**Date:** 2026-11-15

## Context
README §1.2 leaves modeling open ("a modelagem é sua") while requiring users, cost centers, monthly
budgets, requests with items and versions, approval steps and event history.

## Problem
Define aggregates and module boundaries so invariants are enforceable per transaction and modules can be
implemented in parallel by agents.

## Options Considered
1. **One big aggregate** (request + versions + steps + budget + users).
2. **Small aggregates with explicit ownership:** `PurchaseRequest` (working copy + status + version
   pointer), `RequestVersion`+`ApprovalStep` (frozen, owned by the request lifecycle), `Budget` (own
   aggregate; concurrent writer), `User`/`CostCenter` (reference data).
3. DDD-full aggregate per table with domain events everywhere.

## Decision
Option 2. `PurchaseRequest` is the only aggregate whose mutations flow through `TransitionService`;
`Budget` is a separate aggregate with a single mutation path (conditional UPDATE); `User`/`CostCenter`
are reference aggregates mutated only by admin services.

## Rationale
Large aggregates serialize the whole system (every approval would lock the budget aggregate too); tiny
per-table aggregates scatter the invariants. Option 2 matches the transactional seams: transition tx
touches request+version+steps+event+budget row; nothing else shares that tx boundary.

## Consequences
- Clear single-writer ownership per table: `consumed_cents` is written only by `BudgetRepository.consume`,
  `lock_version` only by `PurchaseRequestRepository.claim`, steps only by `ApprovalStepRepository.decide/skipAfter`.
  Since `V7` the database also refuses any change to a decided step (trigger `trg_approval_steps_guard`).
- Cross-aggregate rules (eligibility needs user data) are read-only joins — safe outside the aggregate.

## Trade-offs
No atomic "request+budget" invariant across aggregates — accepted; the budget invariant is self-contained
on its row (consumed ≤ amount), which is stronger for the actual hazard (overdraw).

## Implementation
`persistence/PurchaseRequestEntity` (aggregate root + working copy), `RequestVersionEntity` /
`VersionItemEntity` / `ApprovalStepEntity` (per-version chain), `BudgetEntity`, `UserEntity`,
`CostCenterEntity`. Foreign keys are plain UUID columns (no JPA associations), so bulk updates never
leave stale collections behind. All mutations of the aggregate go through `application/TransitionService`
and `PurchaseRequestService`.

## Verification
`SecurityIntegrationTest#terminalRequestsCannotBeChangedOrDecidedAgainAndBudgetIsConsumedOnce` and
`#decidedApprovalStepsCannotBeRewrittenOrDeleted`; `WorkflowIntegrationTest#fullThreeStepFlowReachesApprovedAndConsumesTheBudget`.
Cypress checklist items FLOW-01 and FLOW-04 (both suites).

## Related Specifications
SPEC-006, SPEC-008, SPEC-011; ADR-008 (transactions).
