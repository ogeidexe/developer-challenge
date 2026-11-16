# SPEC-005 — Cost Center & Budget Management

## 1. Specification Metadata
- **ID:** SPEC-005 · **Feature:** Cost centers + monthly budgets · **Version:** 1.0
- **Priority:** P1 · **Complexity:** S (2–4 h) · **Dependencies:** SPEC-003 · **Wave:** 2
- **Responsible agent:** AGENT-SPEC-005 · **Status:** implemented — drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
Cost centers own budgets; budgets gate final approvals (SPEC-011) and feed the dashboard (SPEC-014).
This spec provides the CRUD surface (ADMIN mutations, read for all) including the `BUDGET_BELOW_CONSUMED` rule.

## 3. Scope
**In:** `GET /cost-centers`, `POST /cost-centers`, `GET /cost-centers/:id/budgets/:yyyy-mm`,
`PUT /cost-centers/:id/budgets/:yyyy-mm` (upsert; amount < consumed → 422).
**Out:** consumption mechanics (SPEC-011); dashboard aggregation (SPEC-014).

## 4. Requirements
FR-046 · FR-047 · FR-048 · FR-049 · SEC-004 · DATA-002 (guard) · NFR-018 · NFR-020 · BR-015 (message quality)

## 5. Business Rules
- Setting a budget below the already-consumed amount → `422 BUDGET_BELOW_CONSUMED` (named values in detail).
- Month format validated (`yyyy-mm`, 400 `INVALID_MONTH_FORMAT`).
- Missing budget month on GET → 200 with zero balance view (`amount="0.00"`, consumed="0.00") — consistent with BR-008 semantics for reads.
- `amount=0` allowed (freezes the center for the month).
- Duplicate cost-center code → 409 `CODE_ALREADY_USED`.

## 6. Architecture (as implemented)
`application.CostCenterService`: list (public), create (ADMIN; duplicate code → 409 `CODE_ALREADY_USED`), `getBudget` (missing month → zeros), `setBudget` (ADMIN) with `BudgetRepository.lockByCostCenterAndMonth` (`PESSIMISTIC_WRITE`) before the "≥ consumed" check → 422 `BUDGET_BELOW_CONSUMED`; month format → 400 `INVALID_MONTH_FORMAT`. Front end: `AdminPage` › Centros de custo / Orçamentos.

## 7. API Contract
Operations `listCostCenters`, `createCostCenter`, `getBudget`, `setBudget`; DTOs `CostCenterDto`,
`BudgetDto`, `SetBudgetRequest` per `openapi.yaml`.

## 8. Database Impact
Tables `cost_centers`, `budgets` (SPEC-002). No new migrations.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 `CostCenterService` + controller | list/create | AT-15 |
| T02 `BudgetAdminService.get` (zero-view) | GET budget | AT-16 |
| T03 `set` with FOR UPDATE + below-consumed check | PUT budget | AT-16, CT-06 |
| T04 month format validation | 400 path | unit |

## 10. Testing Strategy
Unit: month pattern; zero-view mapping. API/DB: PUT below consumed → 422 with code; concurrent PUT vs consumption never violates `consumed<=amount` (CT-06); duplicate code → 409.

## 11. Acceptance Criteria
- **G**iven a center with consumed R$49.200,00 **W**hen ADMIN sets amount R$40.000,00 **T**hen 422 `BUDGET_BELOW_CONSUMED` and the stored amount is unchanged.
- **G**iven no budget for `2026-11` **W**hen GET the month **T**hen 200 with `amount=consumed=available="0.00"`.

## 12. Integration Requirements
`BudgetRepository.define` is the only writer of `budgets.amount_cents` besides consumption (SPEC-011) — the row-lock contract must not be bypassed. `BudgetDto` frozen for SPEC-014/018.

## 13. Risks
Locking on PUT adds contention with approvals — acceptable at challenge scale; document.

## 14. Definition of Done
AT-15/16 + CT-06 green; below-consumed message includes both values (BR-15); AI-logged.
