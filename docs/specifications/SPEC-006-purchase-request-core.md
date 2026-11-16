# SPEC-006 — Purchase Request Core (CRUD · List · Detail)

## 1. Specification Metadata
- **ID:** SPEC-006 · **Feature:** Request aggregate CRUD, scoped list, detail with allowedActions · **Version:** 1.0
- **Priority:** P0 · **Complexity:** L (6–8 h) · **Dependencies:** SPEC-003, SPEC-002 · **Wave:** 2
- **Responsible agent:** AGENT-SPEC-006 (jointly executes SPEC-007) · **Status:** implemented — drafted in `backend/` — not yet compiled or run; UI implemented in `frontend/` — runs, covered by Cypress

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
The heart of the system: creating requests in DRAFT, editing the working copy, listing with
role-scoped visibility, and serving the detail DTO (`allowedActions` + `lockVersion`) that drives the
entire front-end (README §2.2, §2.7).

## 3. Scope
**In:** `POST /requests` (201, DRAFT), `PUT /requests/:id` (working-copy replace; owner;
DRAFT/CHANGES_REQUESTED; optimistic lock), `GET /requests` (pagination/sort/filters + visibility),
`GET /requests/:id` (detail incl. items, steps of current version, `versions[]`, `allowedActions`, `lockVersion`).
**Out:** transitions (SPEC-008); version endpoints (SPEC-010); money math (SPEC-007); inbox (SPEC-009).

## 4. Requirements
FR-006 · FR-008 · FR-009 · FR-010 · FR-011 · FR-012 [D] · FR-050 · FR-051 · FR-052 · FR-053 ·
BR-012 · BR-013 · BR-017 · SEC-001 · NFR-019 · NFR-020 · NFR-021 (lock on edit) · NFR-023 · DATA-006

## 5. Business Rules
- Owner-only edit; statuses `DRAFT`/`CHANGES_REQUESTED` only → else `422 INVALID_TRANSITION`. A non-owner attempting edit (or a non-owner non-ADMIN attempting cancel) gets `403 NOT_REQUEST_OWNER` (A-27) — evaluated after visibility (404) and action-type role (403 FORBIDDEN), before the lock (409).
- Visibility predicate (FR-011, A-26): a `DRAFT` is visible **only to its owner — `ADMIN` included, no exception**. Non-draft visibility: owner sees all own; `APROVADOR` sees non-draft of own center; `ADMIN` sees all non-draft. Anything invisible → 404 (BR-013 + ADR-012). Corollary: `ADMIN` cannot cancel someone else's DRAFT (404 at load) — README §4.2 "dono ou ADMIN" applies to *visible* requests. The approver's center check uses the request's **current** `cost_center_id`; after the owner moves a returned request to another center, the previous center's approvers lose access (A-28).
- `costCenterId` defaults to caller's; must reference an existing center. Editing it in `DRAFT`/`CHANGES_REQUESTED` is allowed but only affects the **next** frozen version — the current version's snapshot keeps its own `cost_center_id` (A-28).
- `neededBy` future check uses business date (America/Sao_Paulo).
- `allowedActions` computed per API-DESIGN §4.4 (owner×DRAFT → EDIT/SUBMIT/CANCEL; eligible approver×PENDING → APPROVE/REJECT/REQUEST_CHANGES; visible non-final × ADMIN → CANCEL + approval actions when eligible; finals → []).
- Pagination is clamped, not rejected (A-30); unknown sort fields → 400 INVALID_SORT.

## 6. Architecture (as implemented)
`application.PurchaseRequestService` (`create`, `update` — wholesale item replace via bulk delete + insert), `application.RequestQueryService` (`detail`, `list` with `RequestSpecifications.visibleTo` + `matching`, clamped paging), `application.RequestMapper` (detail: working copy while editable, frozen version otherwise; `allowedActions` from `domain.AccessPolicy`), `application.RequestAccess` (404 visibility, 403 owner). Idempotent create wraps `create` (SPEC-013).

## 7. API Contract
Operations `createRequest`, `updateRequest`, `listRequests`, `getRequestById` — request/response DTOs
exactly per `openapi.yaml` (`CreateRequestRequest`, `UpdateRequestRequest` (adds `lockVersion`),
`RequestSummaryDto`, `RequestDetailDto`). Errors: 400 (with errors[]), 401, 403, 404, 409 (stale lock on PUT).

## 8. Database Impact
Tables `purchase_requests`, `request_items`. Inserts + wholesale item replace (DELETE+INSERT in tx). No schema change.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Domain aggregate + `VisibilityPolicy` + unit tests | pure domain | UT-01/UT-03 |
| T02 `RequestRepository.findVisible` QueryBuilder (filters, scopes) | list query | AT-08 |
| T03 `PurchaseRequestService.create` (with MoneyCalculator) | 201 path | AT-06 |
| T04 `update` (owner/status/lock checks + item replace) | PUT | AT-07 |
| T05 `get` detail assembler (items, steps, versions, allowedActions, lockVersion) | detail | AT-09/AT-10 |
| T06 list endpoint + envelope + sort whitelist | GET /requests | AT-08 |

## 10. Testing Strategy
Unit: visibility matrix (12 role×status cases incl. **ADMIN×foreign-DRAFT → invisible**); edit policy; allowedActions matrix; ownership matrix (non-owner edit/submit/cancel → 403 NOT_REQUEST_OWNER). API/DB: list filters
each dimension; other users' drafts never listed (even for ADMIN); 403 vs 404 per ADR-012/A-27; PUT bumps lockVersion; stale PUT → 409.

## 11. Acceptance Criteria
- **G**iven a `SOLICITANTE` with 2 requests (1 DRAFT, 1 pending) and another user's DRAFT in the same center
  **W**hen listing **T**hen only the 2 own requests appear; the DRAFT is visible because it is the caller's.
- **G**iven an `APROVADOR` of `CC-TI-01` **W**hen fetching another user's DRAFT by id **T**hen 404.
- **G**iven an `ADMIN` **W**hen listing or fetching another user's DRAFT **T**hen it never appears (404 by id) — drafts are owner-only, no ADMIN exception (A-26).
- **G**iven a non-owner with a valid role **W**hen editing or submitting someone else's request **T**hen 403 `NOT_REQUEST_OWNER` (before any 409/422 check).
- **G**iven the owner with current `lockVersion=3` **W**hen PUT with `lockVersion=2` **T**hen 409 with `currentLockVersion=3`.

## 12. Integration Requirements
Detail DTO feeds SPEC-015/016/017 front-ends; `allowedActions` semantics are the contract (FR-037). `IdempotencyService` (SPEC-013) wraps `createRequest`.

## 13. Risks
`allowedActions` drift between spec and implementation — mitigate with a contract test asserting the full matrix (SPEC-019).

## 14. Definition of Done
AT-06..AT-10 green; visibility matrix unit-tested; detail assembler contract-tested; AI-logged.
