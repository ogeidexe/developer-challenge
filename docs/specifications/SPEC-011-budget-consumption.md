# SPEC-011 — Budget Consumption

## 1. Specification Metadata
- **ID:** SPEC-011 · **Feature:** Atomic budget consumption on final approval · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (4–6 h) · **Dependencies:** SPEC-005 (budget repository), SPEC-008 (call site) · **Wave:** 3
- **Responsible agent:** AGENT-SPEC-011 · **Status:** implemented — drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
BR-006/BR-009: the final approval and the budget consumption are the **same transaction**; the balance
never goes negative even when two final approvals race (README §2.3.5). The `BUDGET_EXCEEDED` case must
leave the request pending and explain available vs required (BR-015).

## 3. Scope
**In:** `BudgetConsumptionService.consumeOnFinalApproval(request, version)` with the conditional atomic
UPDATE keyed by the **version's frozen cost center**; missing-month ⇒ zero-balance semantics; on failure a
typed `DomainError(BUDGET_EXCEEDED)` that TransitionService turns into a full rollback + separate
`APPROVAL_FAILED_BUDGET` event.
**Out:** budget administration (SPEC-005); dashboard reads (SPEC-014).

## 4. Requirements
FR-019 · FR-020 · FR-021 (budget side) · BR-006 · BR-007 · BR-008 · BR-009 · DATA-001 · DATA-002 · NFR-006 · QA-004

## 5. Business Rules
- Consumption keyed by (the **version's frozen cost_center_id**, its competence_month) — never "now", never the working copy's center (A-28).
- Runs strictly **after** the aggregate lock UPDATE (which is the transition's first write) — so a racing same-step approver is already gone (409) before money moves.
- Conditional UPDATE: `consumed + amount <= amount_cents`; 0 rows ⇒ `DomainError(BUDGET_EXCEEDED)`.
- No row for the month ⇒ same error (zero balance per BR-008).
- Never negative — DB CHECK is the final backstop.
- On failure the whole transition rolls back (no lock bump); the `APPROVAL_FAILED_BUDGET` event commits in a separate short transaction.
- No separate "reservation" state exists: consumption is the approval (README §4.2).

## 6. Architecture (as implemented)
No separate budget service: `TransitionService.consumeBudget` calls `BudgetRepository.consume` (native conditional UPDATE on the version's frozen center and competence month); 0 rows → `DomainException.BudgetExceeded` with available vs required in BRL and the data for the audit row; `TransitionFacade` records it after the rollback. `BudgetRepository.consume` is the only writer of `consumed_cents`.

## 7. API Contract
No new endpoints; shapes the 422 `BUDGET_EXCEEDED` problem detail: detail must name center code, month,
available and required amounts (see ERROR-CATALOG example — mirrors README §3.3).

## 8. Database Impact
Writes `budgets.consumed_cents` only. No schema change.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 `BudgetRepository.consume` conditional UPDATE + rowcount contract | adapter | unit (mock EM) |
| T02 `BudgetConsumptionService` (resolve month row, error mapping with values) | service | IT-04 |
| T03 Wire into `TransitionService.approve` final path | integration | IT-01 |
| T04 Concurrency tests (two finals; final vs PUT-budget) | suite | CT-02/CT-06 |

## 10. Testing Strategy
Integration: happy consumption (consumed increases exactly); insufficient ⇒ 422 + unchanged status +
`APPROVAL_FAILED_BUDGET` event; missing month ⇒ 422. Concurrency: N parallel finals on one balance ⇒ sum
≤ amount, exactly the fitting subset wins, losers 422 (CT-02); never-negative assertion loop (100 trials).

## 11. Acceptance Criteria
- **G**iven balance R$8.200,00 and a R$24.499,50 final approval **W**hen approving **T**hen 422 `BUDGET_EXCEEDED`, detail contains both values, status stays pending, consumed unchanged.
- **G**iven two R$7.000 finals racing on R$10.000 balance **W**hen both commit **T**hen exactly one is APPROVED and balance is R$7.000.

## 12. Integration Requirements
Called only from `TransitionService`; error type is `DomainError(BUDGET_EXCEEDED)` — never leak SQL errors.

## 13. Risks
Row-lock contention at scale — acceptable (README scale); retry-storms mitigated by 422 (non-retryable) semantics.

## 14. Definition of Done
IT-01/04, CT-02, CT-06 green; error detail contract-tested; AI-logged.
