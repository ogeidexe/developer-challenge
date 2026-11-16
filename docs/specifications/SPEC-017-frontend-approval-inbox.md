# SPEC-017 — Frontend Approval Inbox & Actions

## 1. Specification Metadata
- **ID:** SPEC-017 · **Feature:** Inbox screen + decision modals + 409/422 UX · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (5–6 h) · **Dependencies:** SPEC-015, SPEC-008/009 (APIs), SPEC-016 (detail patterns) · **Wave:** 4
- **Responsible agent:** AGENT-SPEC-017 · **Status:** implemented in `frontend/` — runs, covered by Cypress

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
The approver journey: a work queue that already applies eligibility, one-click approve, and mandatory
comment modals for reject/return — plus the conflict UX the README explicitly grades (FR-038/039).

## 3. Scope
**In:** `GET /approvals/inbox` screen (paginated, shows `currentStep`); decision actions from detail
(APPROVE/REJECT/REQUEST_CHANGES via `allowedActions`); comment modal (≥10 chars client hint, server
authoritative); 409 conflict banner + auto-refetch; 422 business banners with server `detail`.
**Out:** list/detail page duplication (reuses SPEC-016 pages); admin (SPEC-018).

## 4. Requirements
FR-034 · FR-037 · FR-038 · FR-039 · FR-025 (client) · NFR-016 (part of the ≥3 significant tests)

## 5. Business Rules
- Buttons only from `allowedActions`; the modal enforces ≥10 chars before submit (server revalidates).
- After any decision: refetch detail + invalidate inbox query (queue changes).
- On 409: banner + refetch (FR-039 wording: "alguém agiu antes de você" style).
- On 422: show `detail` verbatim in a dismissible banner; keep the modal open with the comment preserved.

## 6. Architecture (as implemented)
`src/features/approvals/InboxPage.tsx` (antd `Table`, paging in the URL) and the decision `Modal` in `RequestDetailPage.tsx` (comment ≥ 10 chars for reject/return; 422 shown inside the modal; 409 → warning banner + refetch). After any decision the detail, history, versions, list, inbox and dashboard queries are invalidated.

## 7. API Contract
Consumes `getApprovalInbox`, `approveRequest`, `rejectRequest`, `requestChanges`, `getRequestById`.

## 8. Database Impact
None (client).

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Inbox screen (step badge, pagination) | screen | FT-02 |
| T02 Decision modal (comment rules) | component | FT-04 |
| T03 Mutations + invalidation | flows | FT-02/04 |
| T04 409/422 surfaces end-to-end | UX | FT-05 |

## 10. Testing Strategy
Significant tests: (1) inbox renders only items returned by API and buttons follow `allowedActions`;
(2) modal blocks submit <10 chars and calls reject with comment; (3) 409 response → banner + refetch
triggered; (4) 422 shows server detail.

## 11. Acceptance Criteria
- **G**iven `allowedActions:["APPROVE","REJECT","REQUEST_CHANGES"]` **W**hen viewing a pending request **T**hen exactly those actions render.
- **G**iven a reject with a 7-char comment **W**hen submitting **T**then the UI blocks with the min-length hint and no request is sent.
- **G**iven a 409 on approve **W**hen responding **T**then a conflict banner appears and the detail/inbox refresh.

## 12. Integration Requirements
Shares SPEC-016 detail/action-bar components; contract with `InboxItemDto` frozen.

## 13. Risks
Duplicate decision submissions (double-click) — disable button while pending; idempotency on transitions is [D] only.

## 14. Definition of Done
FT-02/04/05 green; significant-test count satisfied; AI-logged.
