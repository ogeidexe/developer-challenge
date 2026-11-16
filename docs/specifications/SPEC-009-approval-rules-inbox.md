# SPEC-009 — Approval Rules, Eligibility & Inbox

## 1. Specification Metadata
- **ID:** SPEC-009 · **Feature:** Chain builder, eligibility/segregation policies, inbox · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (5–6 h) · **Dependencies:** SPEC-006 (domain part buildable in Wave 2) · **Wave:** 2 (domain) / 3 (inbox endpoint)
- **Responsible agent:** AGENT-SPEC-009 · **Status:** implemented — drafted in `backend/` — not yet compiled or run; inbox UI implemented in `frontend/` — runs, covered by Cypress

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
The rules that make this a pleno challenge: value/category-driven chain construction (README §2.3),
who can approve what (level/cost-center/ADMIN), segregation of duties (self + duplicate), and the
inbox that shows only actionable work.

## 3. Scope
**In:** `ApprovalChainBuilder` (pure), `ApproverEligibilityPolicy` (pure), `SegregationOfDutiesPolicy`
(pure), `ApprovalInboxQuery` + `GET /approvals/inbox` (APROVADOR/ADMIN; paginated; costCenterId filter).
**Out:** transitions themselves (SPEC-008); step persistence (SPEC-010).

## 4. Requirements
FR-013 · FR-014 · FR-015 · FR-016 · FR-017 (rules side) · FR-023 · FR-025 · FR-061 · BR-001 · BR-002 ·
BR-004 · BR-005 · DATA-009

## 5. Business Rules
- Chain thresholds (cents): total ≤ 100000 → `[N1]`; ≤ 1000000 → `[N1,N2]`; else `[N1,N2,ADMIN]` (BR-004).
- SOFTWARE appends `ADMIN` if absent; never duplicated (BR-005).
- Eligibility (FR-016): N1 ← APROVADOR(N1|N2) same CC or ADMIN; N2 ← APROVADOR(N2) same CC or ADMIN; ADMIN ← ADMIN only. ADMIN is not CC-restricted (A-21).
- Segregation: owner ⇒ `SELF_APPROVAL_FORBIDDEN`; a prior approval by the same user **in the current version** ⇒ `DUPLICATE_APPROVER`. The rule is per-version: approvals in older versions do not count against the caller.
- Inbox shows requests in PENDING_APPROVAL whose current step is actionable — excluding the caller's own requests and **versions in which the caller already approved a step**; applies CC for non-ADMIN; empty inbox is normal; a step with no eligible approver simply shows for nobody (FR-023).

## 6. Architecture (as implemented)
`domain.ApprovalChainBuilder.build`, `domain.ApprovalPolicies` (`isEligible`, `requireEligible`, `segregationViolation`/`requireSegregation`, `requireComment`) — pure static functions. `application.InboxService`: SQL pre-filter (pending, scope) then the same policy functions per candidate (one chain query per candidate — N+1, acceptable at this scale; a single SQL is the follow-up). The same functions feed `AccessPolicy.allowedActions`, so inbox and buttons agree.

## 7. API Contract
Operation `getApprovalInbox` → `InboxPage` (`InboxItemDto` = summary + `currentStep`). Errors: 401; 403 for SOLICITANTE.

## 8. Database Impact
Reads only (`purchase_requests`, `approval_steps`, `users` for eligibility context). No schema change.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 `ApprovalChainBuilder` + boundary table tests (incl. SOFTWARE, dup-ADMIN guard) | pure builder | UT-04/UT-05 |
| T02 `ApproverEligibilityPolicy` matrix tests | pure policy | UT-06 |
| T03 `SegregationOfDutiesPolicy` (self, duplicate) | pure policy | UT-07 |
| T04 `ApprovalInboxQuery` SQL + service | inbox endpoint | AT-12 |
| T05 inbox edge cases (own request excluded; already-approved version excluded; CC scoping; admin sees all) | tests | AT-12 |

## 10. Testing Strategy
Unit (table-driven): chain boundaries at exactly 100000/100001/1000000/1000001 cents; SOFTWARE variants;
eligibility across roles/levels/CC/ADMIN; segregation cases. API: inbox respects visibility & segregation;
SOLICITANTE → 403; pagination envelope correct.

## 11. Acceptance Criteria
- **G**iven a R$10.000,00 SOFTWARE request **W**hen submitted **T**hen chain = N1 → N2 → ADMIN.
- **G**iven a R$1.000,00 request **W**hen submitted **T**hen chain = N1 only.
- **G**iven an approver who approved N1 of v1 **W**hen v2 is submitted and they are otherwise eligible **T**hen v2 appears in their inbox and they may approve its N1 step — segregation resets per version, and only an approval within v2 itself would raise `422 DUPLICATE_APPROVER`.
- **G**iven the owner is the only eligible ADMIN **W**hen the ADMIN step is reached **T**hen the request remains pending (not an error) and appears in no inbox except checks — the seed's second admin resolves it.

## 12. Integration Requirements
Policies are consumed by SPEC-008 transitions and SPEC-006 `allowedActions` — identical outcomes required (contract test in SPEC-019 asserts inbox ⇔ allowedActions consistency).

## 13. Risks
Inbox SQL drift from transition eligibility — mitigate by sharing the pure policy function in both paths and asserting cross-consistency in SPEC-019.

## 14. Definition of Done
UT-04..UT-07, UT-10, AT-12 green; policy duplication-free (single implementation); AI-logged.
