# SPEC-016 — Frontend Request Management

## 1. Specification Metadata
- **ID:** SPEC-016 · **Feature:** List + create/edit form + detail screens · **Version:** 1.0
- **Priority:** P0 · **Complexity:** L (8–10 h) · **Dependencies:** SPEC-015, SPEC-006/010/012 (APIs) · **Wave:** 4
- **Responsible agent:** AGENT-SPEC-016 · **Status:** implemented in `frontend/` — runs, covered by Cypress

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
The requester journey: create with dynamic items, watch the total update (display only), submit, track
versions/steps/timeline, and share filtered list URLs (README §2.7).

## 3. Scope
**In:** `GET /requests` list page (URL-reflected `page/size/sort/status/category/costCenterId/createdFrom/createdTo/minAmount/maxAmount/q`); create/edit form (dynamic item rows, live total, server `errors[]` field mapping, `Idempotency-Key` generated per form-open); detail page (data, items, steps chain, `versions[]` with links, history timeline); edit/cancel/submit actions gated by `allowedActions`.
**Out:** approval actions UI (SPEC-017); admin screens (SPEC-018).

## 4. Requirements
FR-032 · FR-033 · FR-035 · FR-036 · FR-037 · FR-052 (client) · INT-002

## 5. Business Rules
- Every action button rendered **only** if present in `allowedActions` (FR-037 — never reimplement rules).
- Form sends freshest `lockVersion` on edit/submit/cancel; on 409 show conflict banner + refetch detail (FR-039).
- `Idempotency-Key`: one UUID per form session, reused on retries of the same create.
- Reject/request-changes modal lives in SPEC-017 but the comment-modal primitive is shared here.
- Live total formatting: BRL with 2 decimals (Intl.NumberFormat pt-BR) — display only.

## 6. Architecture (as implemented)
`src/features/requests/RequestListPage.tsx` (antd `Table` with server paging/sorting, filters in the URL, multi-key URL updates), `RequestFormPage.tsx` (antd `Form` + `Form.List`, `Form.useWatch` live total, comma decimals, server `errors[]` mapped to fields, one `Idempotency-Key` per form session), `RequestDetailPage.tsx` (data, working copy vs frozen version, `Steps` chain with v1/v2 switch, `Timeline` history, actions from `allowedActions`). No react-hook-form/zod (deviation D-01).

## 7. API Contract
Consumes: `listRequests`, `createRequest`, `updateRequest`, `getRequestById`, `submitRequest`,
`cancelRequest`, `listRequestVersions`, `getRequestVersion`, `getRequestHistory`, `listCostCenters` (for picker).

## 8. Database Impact
None (client).

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 List page + URL state + filters | screen | FT-01 |
| T02 Form (dynamic items, live total, key handling) | screen | FT-01 |
| T03 Detail page (steps, versions, timeline) | screen | FT-03 |
| T04 Actions wiring (submit/cancel/edit via allowedActions) | flows | FT-03 |
| T05 Error mapping (400→fields, 409 banner, 422 banner) | UX | FT-04/FT-05 |

## 10. Testing Strategy
Component tests (≥3 significant, NFR-016): items form computes display total and submits exact payload
(no client total); list renders from mocked envelope and syncs URL params; detail renders actions from a
mocked `allowedActions` array (assert absent actions not rendered — FT-02 core).

## 11. Acceptance Criteria
- **G**iven a shareable URL with `?status=PENDING_APPROVAL&page=2` **W**hen opened **T**then the list loads page 2 filtered by status.
- **G**iven detail with `allowedActions:["EDIT","SUBMIT","CANCEL"]` **W**hen rendered **T**hen no approve/reject buttons exist.
- **G**iven a 409 on submit **W**hen the server responds **T**then the banner explains someone acted first and the detail refreshes with the new `lockVersion`.

## 12. Integration Requirements
Depends on SPEC-015 exports and frozen DTOs; SPEC-017 reuses the detail action bar pattern.

## 13. Risks
URL-state desync with filters — covered by FT-01; form key reuse across edits is wrong by design (key per form session only).

## 14. Definition of Done
FT-01/03/04/05 green; ≥3 significant tests (NFR-016 satisfied with FT-02 in SPEC-017); AI-logged.
