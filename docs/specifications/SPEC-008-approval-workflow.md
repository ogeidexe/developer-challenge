# SPEC-008 — Submission & Approval Workflow (Transitions)

## 1. Specification Metadata
- **ID:** SPEC-008 · **Feature:** submit/approve/reject/request-changes/cancel + state machine · **Version:** 1.0
- **Priority:** P0 · **Complexity:** L (8–10 h) · **Dependencies:** SPEC-006, SPEC-007, SPEC-009, SPEC-010, SPEC-011, SPEC-012 · **Wave:** 3
- **Responsible agent:** AGENT-SPEC-008 · **Status:** implemented — drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
The state machine of README §4.2 as executable code. Every transition runs the §4.3 verification
pipeline inside one transaction, delegates business rules to pure domain policies (SPEC-009), freezes
versions (SPEC-010), consumes budget on final approval (SPEC-011) and appends audit events (SPEC-012).
This is the highest-weighted evaluation area (25% domain + 15% consistency).

## 3. Scope
**In:** `RequestStateMachine` (all valid/invalid transitions, table-driven); `TransitionService` with
`submit/approve/reject/requestChanges/cancel`; endpoints `POST /requests/:id/{submit,approve,reject,request-changes,cancel}`;
lock guard wiring; comment policy; failure-event path for `BUDGET_EXCEEDED`.
**Out:** eligibility/segregation policies themselves (SPEC-009); chain builder is invoked via SPEC-010's freeze (kept cohesive there); idempotency interceptor (SPEC-013).

## 4. Requirements
FR-013 · FR-017 · FR-018 · FR-019 · FR-022 (workflow side) · FR-055–FR-059 · BR-001–BR-006 · BR-014–BR-018 ·
DATA-001 · DATA-006 · NFR-006 · NFR-021 · NFR-024 (via error mapping) · QA-001

## 5. Business Rules
- Transition table exactly per README §4.2; invalid ⇒ `422 INVALID_TRANSITION` with explanatory detail. Ownership violations are **not** transition errors: non-owner submit, or cancel by a non-owner non-ADMIN ⇒ `403 NOT_REQUEST_OWNER` before the transaction (A-27).
- Owner-only submit; owner-or-ADMIN cancel of **visible** requests (a foreign DRAFT is invisible to ADMIN → 404; A-26).
- Comment: optional on approve (schema imposes **no** min length — `"OK"` is legal); mandatory ≥10 chars on reject/request-changes ⇒ `422 COMMENT_REQUIRED` from CommentPolicy.
- Business-rule precedence inside 422: state → eligibility → segregation → comment → budget (ERROR-CATALOG §3.5).
- The transition transaction's **first write is the aggregate lock UPDATE** (`WHERE lock_version=:expected`; 0 rows → 409) — a racing same-step approver is rejected with 409 even on the final step (README §2.3.5), never 422 (see TRANSACTION-STRATEGY §3.1/§4).
- Final approval consumes budget in the same tx; insufficient ⇒ **full rollback** (no lock bump), `APPROVAL_FAILED_BUDGET` written in a **separate short transaction**, then `422 BUDGET_EXCEEDED` with status unchanged.
- Steps record outcomes (A-31): approve → current step `APPROVED`; reject → `REJECTED`; request-changes → `RETURNED`; cancel from `PENDING_APPROVAL` → `CANCELLED`. On reject/return/cancel every later `PENDING` step of the version → `SKIPPED` in the same tx (a closed version never shows a `PENDING` step). Decisions use `UPDATE … WHERE id=:id AND status='PENDING'` (0 rows → 409).
- Terminal states reject every action.

## 6. Architecture (as implemented)
`application.TransitionService` (`@Transactional`): `submit`, `decide` (approve/reject/request-changes), `cancel`. Order: `RequestAccess.loadVisible` (404) → role/owner (403) → `RequestLock.claim` (**first write**, 0 rows → 409) → `RequestStateMachine.require` (422) → `ApprovalPolicies` (eligibility → segregation → comment) → [final approve: `BudgetRepository.consume`] → `ApprovalStepRepository.decide` (`WHERE status='PENDING'`) → `skipAfter` on reject/return/cancel → status → `AuditService.record` → flush/clear → detail DTO. `application.TransitionFacade` (not transactional) audits `APPROVAL_FAILED_BUDGET` in `REQUIRES_NEW` after the rollback. `domain.RequestStateMachine` is an `EnumMap` table with `require`/`next`.

## 7. API Contract
Operations `submitRequest`, `approveRequest`, `rejectRequest`, `requestChanges`, `cancelRequest`;
body `{lockVersion, comment?}`; 200 + `RequestDetailDto`. Error set per endpoint in `openapi.yaml` +
ERROR-CATALOG (incl. 422 codes with BR-15-quality details).

## 8. Database Impact
Writes `purchase_requests` (status/lock/submitted/decided), `approval_steps`, plus inserts owned by
SPEC-010/011/012. No schema change.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 `RequestStateMachine` table-driven (+invalid matrix) | pure machine | UT-11 (all §4.2 rows) |
| T02 Lock guard + tx wrapper | 409/tx semantics | CT-04 |
| T03 `submit` path (delegates freeze to RequestVersioningService) | resubmit ⇒ v2 | IT-05 |
| T04 `approve` intermediate/final paths (with consumption delegate) | step advance / APPROVED | IT-01..IT-04 |
| T05 `reject` / `requestChanges` (comment policy) | finals / CHANGES_REQUESTED | UT-08, AT-11 |
| T06 `cancel` (owner/ADMIN) | CANCELLED | UT-11 |
| T07 Failure-event path (budget) | rollback then APPROVAL_FAILED_BUDGET in separate tx | IT-04 |

## 10. Testing Strategy
Unit: full transition matrix valid+invalid; precedence ordering of 422 codes (mutant-style assertions
on which code surfaces when multiple rules are violated). Integration: 3-step flow to APPROVED with
consumption; segregation scenarios; reject/return flows; cancel paths. Concurrency: CT-01.

## 11. Acceptance Criteria
- **G**iven a submitted 3-step request and an eligible N1 approver **W**hen they approve with current lockVersion **T**hen 200, current step advances to N2, lockVersion+1, event `APPROVED` (step N1) appended.
- **G**iven a request in REJECTED **W**hen any transition is attempted **T**hen 422 `INVALID_TRANSITION` naming the status.
- **G**iven two rules violated at once (wrong level + no comment) **W**hen rejecting **T**hen the 422 code is `APPROVER_NOT_ELIGIBLE` (precedence) and detail explains it.
- **G**iven final approval with insufficient budget **W**hen approving **T**hen the transition rolls back (lock unchanged), `APPROVAL_FAILED_BUDGET` is persisted from a separate transaction, and the response is 422 `BUDGET_EXCEEDED` with status unchanged.
- **G**iven two ADMINs approving the same final step concurrently with a near-exhausted budget **W**hen both commit **T**hen exactly one succeeds and the other gets **409** (never 422), no `APPROVAL_FAILED_BUDGET` event exists, and the balance is consumed once (README §2.3.5).

## 12. Integration Requirements
Freezes chain-building through SPEC-010; consumes via SPEC-011; audits via SPEC-012; eligibility via SPEC-009; front-end consumes only `allowedActions` + errors.

## 13. Risks
Orchestration complexity → keep service thin, policies pure; highest regression risk, hence contract tests in SPEC-019.

## 14. Definition of Done
UT-11 full matrix; IT-01..IT-05, CT-01, AT-11 green; precedence tests green; AI-logged.
