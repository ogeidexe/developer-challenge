# SPEC-018 — Frontend Administration

## 1. Specification Metadata
- **ID:** SPEC-018 · **Feature:** Admin screens (users, cost centers, budgets) · **Version:** 1.0
- **Priority:** P2 (README §2.7: screens **not** required — API + seed suffice) · **Complexity:** S (3–5 h) · **Dependencies:** SPEC-015, SPEC-004/005 APIs · **Wave:** 5
- **Responsible agent:** AGENT-SPEC-018 · **Status:** implemented in `frontend/` — runs, covered by Cypress (optional — excluded from MVP DoD)

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
Minimal ADMIN UI so the demo video can manage users/centers/budgets without raw curl — a differentiator
(§6 "Telas de administração no front") that is cheap once SPEC-015 exists.

## 3. Scope
**In:** users list/create/edit; cost centers list/create; budget view/set per month (with
`BUDGET_BELOW_CONSUMED` surfaced). Simple tables/forms reusing SPEC-015/016 primitives.
**Out:** activation flows beyond the API; bulk ops.

## 4. Requirements
FR-040 (negative scope respected — this is additive) · FR-005/046/047/048/049 (client) · SEC-004 (client mirror)

## 5. Business Rules
- All mutations ADMIN-only; guards hide the area otherwise (server still 403s).
- Budget form shows consumed vs amount and pre-validates the below-consumed case.

## 6. Architecture (as implemented)
`src/features/admin/AdminPage.tsx` with three tabs: users (create/edit modal, level required for APROVADOR), cost centers (create, duplicate code error), budgets (center + month picker, PUT with the "below consumed" 422 shown on the field).

## 7. API Contract
Consumes `listUsers`, `createUser`, `updateUser`, `listCostCenters`, `createCostCenter`, `getBudget`, `setBudget`.

## 8. Database Impact
None (client).

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Users admin (list/create/edit) | screen | component test |
| T02 Cost centers admin | screen | component test |
| T03 Budget editor (month picker, error surface) | screen | FT-06 |

## 10. Testing Strategy
Component: budget editor shows the 422 `BUDGET_BELOW_CONSUMED` detail; user form maps role/level conditional.

## 11. Acceptance Criteria
- **G**iven consumed R$49.200 **W**hen an ADMIN sets R$40.000 in the UI **T**then the server detail appears inline.

## 12. Integration Requirements
Reuses frozen DTOs; no new server needs.

## 13. Risks
Scope creep — keep tables plain; skip when time is short (P2).

## 14. Definition of Done
FT-06 green (or spec explicitly waived); AI-logged.
