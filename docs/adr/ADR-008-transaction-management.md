# ADR-008 — Transaction Management: One `@Transactional` Service Method per Use Case

**Status:** Accepted · revised 2026-11-18 to match the current implementation
**Date:** 2026-11-15

## Context
README §5.1 requires explicit transactions on transitions; a final approval writes four things that must
commit or roll back together (request lock/status, step, budget, audit event). README §2.3 rule 5 also
requires a failed final approval to leave the request untouched — while the attempt should still be audited.

## Problem
Define where transaction boundaries live, how the failed-budget audit escapes the rollback, and how JPA's
persistence context coexists with the bulk SQL used for concurrency.

## Options Considered
1. Repository-level implicit transactions.
2. **Service-level boundaries** with Spring `@Transactional` (default `REQUIRED`), plus a non-transactional
   facade for the one case that needs a second transaction.
3. Programmatic transactions everywhere.

## Decision
Option 2.
- Each use case is one `@Transactional` method: `PurchaseRequestService.create/update`,
  `TransitionService.submit/decide/cancel`, `CostCenterService.setBudget`, `UserAdminService.create/update`,
  `AuthService.register`. Reads are `@Transactional(readOnly = true)`.
- `AuditService.record` uses `Propagation.MANDATORY` — an event can only be written inside the action's
  transaction.
- **Budget failure**: `TransitionFacade` (deliberately not transactional) calls `TransitionService.decide`;
  when it throws `BudgetExceeded`, Spring has already rolled the whole transaction back (lock bump
  included), and the facade then calls `AuditService.recordBudgetFailure`
  (`Propagation.REQUIRES_NEW`) to commit only the `APPROVAL_FAILED_BUDGET` event.
- `IdempotencyService` uses a `TransactionTemplate` so the key reservation and the create share one
  transaction (ADR-010).
- **Persistence context vs bulk SQL**: the lock claim is a `@Modifying(clearAutomatically = true)` update,
  so the request is re-read after it; every write use case ends with `flush()` + `clear()` before building
  the response, so the DTO never shows stale managed entities.
- Isolation: PostgreSQL's default READ COMMITTED (ADR-009 explains why that is enough).

## Rationale
The boundary mirrors the business operation exactly ("consome o orçamento na mesma transação", README §4.2).
The facade makes the "rollback, then audit" order structural rather than a convention inside one method.

## Consequences
- Nested service calls join the outer transaction (e.g. the demo seed runs all of them in one transaction).
- Self-invocation does not start a new transaction — that is why the facade is a separate bean.

## Trade-offs
Transactions hold the request row lock until commit; operations are short, so contention is limited to
true conflicts (which should get 409 anyway).

## Verification
`WorkflowIntegrationTest#budgetExceededKeepsTheRequestPendingAndOnlyAuditsTheAttempt` (rollback, then the
`REQUIRES_NEW` event) and `#staleLockVersionIs409AndChangesNothing`; `ConcurrencyIntegrationTest` (one transaction per
transition under real threads). Cypress checklist BUDGET-01 (the request stays pending and the attempt is in the
history) and FLOW-01.

## Related
ADR-009, ADR-010; `database/TRANSACTION-STRATEGY.md`.
