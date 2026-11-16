# AGENT-SPEC-006 — Purchase Request Core (+ SPEC-007 Money/Items)

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement the request aggregate CRUD, role-scoped list with filters, and the detail DTO with
`allowedActions` + `lockVersion` — plus the Money value object and item calculations (SPEC-007).
You own `backend/src/domain/request/**`, `domain/money/**`, `modules/requests/**`.

## Mandatory reading order
1. `README.md` (§2.2, §3.2) + `AGENTS.md`.
2. `docs/api/openapi.yaml` (`createRequest`, `updateRequest`, `listRequests`, `getRequestById`), `API-DESIGN.md` §4.4 (allowedActions matrix).
3. `docs/architecture/uml/request-state-machine.puml`, `docs/database/ERD-PHYSICAL.md` (requests/items).
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-006-purchase-request-core.md` and `SPEC-007-request-items-monetary-calculation.md`.

## Rules
- Transitions are OUT (SPEC-008) — but `allowedActions` must encode the matrix from API-DESIGN §4.4 using SPEC-009 policies when available; until SPEC-009 lands, implement the eligibility check behind a small local interface so SPEC-009 can replace the binding without touching your code (note the seam in your report).
- Idempotency interception is OUT (SPEC-013) — expose `createRequest` normally; SPEC-013 wraps it.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- Domain: `PurchaseRequest` aggregate + working copy items; `VisibilityPolicy` (**a DRAFT is visible only to its owner — `ADMIN` has no exception, A-26**; approver sees non-draft own CC; ADMIN sees all non-draft); `RequestEditPolicy` (non-owner ⇒ `403 NOT_REQUEST_OWNER`, A-27); `Money` (bigint cents BRL, parse/format, `times/plus/isGreaterThan/toDecimalString`); `MoneyCalculator` with property+table tests.
- `POST /requests` (201, default CC = caller's, server-side total; event emission via AuditLogService behind an interface; idempotency handled by SPEC-013's interceptor — the key row is reserved inside the create transaction per TRANSACTION-STRATEGY §3.4).
- `PUT /requests/:id` (owner; DRAFT/CHANGES_REQUESTED; wholesale item replace; lock_version optimistic 409 + `currentLockVersion`).
- `GET /requests` (page/size/sort whitelist `createdAt,title,total,status,submittedAt`; filters status/category/costCenterId(multi)/createdFrom/createdTo/minAmount/maxAmount/q; visibility predicate; envelope per contract).
- `GET /requests/:id` (detail: items, steps of current version, `versions[]` light list, `allowedActions`, `lockVersion`).

## Contracts you must not break
- DTO shapes frozen; money decimal strings; 404 (not 403) for invisible resources; **drafts never leak to anyone but the owner — including ADMIN (A-26)**; non-owner edit ⇒ `403 NOT_REQUEST_OWNER` (A-27).

## Validation
- UT-01/02/03 (visibility matrix, money property tests, edit policy), AT-06..AT-10 green.

## Report format
Modified files, test summary, the eligibility seam note, deviations, blockers.
