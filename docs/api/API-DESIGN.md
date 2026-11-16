# API Design

> REST over HTTPS, JSON. Contract master: `openapi.yaml` (OpenAPI 3.1) — served in-app at `/docs` (Swagger UI).
> All rules below are normative; the OpenAPI file is the executable form of this document.
> Implemented by `backend/.../api` (`RequestController`, `WorkflowController`, `AdminController`,
> `GlobalExceptionHandler`) — and mirrored by the front end's fake backend (`frontend/src/shared/api/mock`).

## 1. Global conventions

| Topic | Decision |
|---|---|
| Base path | none (versioning by stability, not URL — single-version challenge deployment; see §8) |
| Auth | `Authorization: Bearer <JWT>` except: `POST /auth/register`, `POST /auth/login`, `GET /health`, `GET /cost-centers`, `/docs`, `/v3/api-docs` |
| Correlation | `X-Request-Id` echoed on every response (generated UUID when absent) — NFR-007 |
| Dates | ISO 8601 with offset, UTC storage (NFR-020): `2026-11-15T14:23:00.123Z` |
| Money | decimal string, 2 fraction digits, BRL: `"4899.90"` (DATA-005) |
| Errors | `application/problem+json` (RFC 9457) — schema in `ERROR-CATALOG.md` |
| Verification order | 401 → 404 (invisible) → 403 (role) → 409 (lockVersion/idempotency) → 422 (business) — BR-014 |

## 2. Pagination, sorting, filtering

`GET /requests`, `GET /approvals/inbox`, `GET /users`:

- `page` (0-based, default 0), `size` (1–100, default 20). Out-of-range values are **clamped** (`page<0 → 0`; `size` → nearest bound) — shareable links never break with 400 (A-30).
- `sort=<field>,<asc|desc>`; whitelist per endpoint (unknown field/direction → `400 INVALID_SORT`).
- `GET /requests` filters: `status`, `category`, `costCenterId` (multi-value comma-separated), `createdFrom`, `createdTo` (ISO date, inclusive), `minAmount`, `maxAmount` (decimal strings), `q` (case-insensitive substring on title). [D] filters are implemented but not gated in MVP acceptance.
- Response envelope: `{ "data": [...], "page": 0, "size": 20, "totalElements": 135, "totalPages": 7 }` (NFR-019).

## 3. Endpoint inventory (25 operations)

| # | Method & path | Auth (role) | operationId | Summary |
|---|---|---|---|---|
| 1 | POST /auth/register | public | `registerUser` | Create `SOLICITANTE` |
| 2 | POST /auth/login | public | `login` | JWT issuance (15 min) |
| 3 | GET /auth/me | any | `getMe` | Current user |
| 4 | GET /users | ADMIN | `listUsers` | Paginated user list |
| 5 | POST /users | ADMIN | `createUser` | Create any role/level |
| 6 | PATCH /users/:id | ADMIN | `updateUser` | Edit role/level/center/active |
| 7 | GET /cost-centers | public | `listCostCenters` | List centers (the sign-up form needs it) |
| 8 | POST /cost-centers | ADMIN | `createCostCenter` | Create center |
| 9 | GET /cost-centers/:id/budgets/:yyyy-mm | any | `getBudget` | Monthly budget |
| 10 | PUT /cost-centers/:id/budgets/:yyyy-mm | ADMIN | `setBudget` | Define budget (≥ consumed) |
| 11 | GET /requests | any (scoped) | `listRequests` | Paginated/filtered list |
| 12 | POST /requests | any | `createRequest` | Create DRAFT (`Idempotency-Key`) |
| 13 | GET /requests/:id | any (visible) | `getRequestById` | Detail + steps + `allowedActions` + `lockVersion` |
| 14 | PUT /requests/:id | owner | `updateRequest` | Edit working copy |
| 15 | GET /requests/:id/versions | any (visible) | `listRequestVersions` | Version list |
| 16 | GET /requests/:id/versions/:n | any (visible) | `getRequestVersion` | Specific version |
| 17 | POST /requests/:id/submit | owner | `submitRequest` | Submit/resubmit |
| 18 | POST /requests/:id/approve | eligible approver | `approveRequest` | Approve current step |
| 19 | POST /requests/:id/reject | eligible approver | `rejectRequest` | Reject (comment ≥ 10) |
| 20 | POST /requests/:id/request-changes | eligible approver | `requestChanges` | Return for adjustment (comment ≥ 10) |
| 21 | POST /requests/:id/cancel | owner or ADMIN | `cancelRequest` | Cancel |
| 22 | GET /requests/:id/history | any (visible) | `getRequestHistory` | Append-only event timeline |
| 23 | GET /approvals/inbox | APROVADOR/ADMIN | `getApprovalInbox` | Actionable inbox |
| 24 | GET /dashboard/summary | any | `getDashboardSummary` | Role-scoped totals + budgets |
| 25 | GET /health | public | `getHealth` | App + DB status |

## 4. Key contracts (exact shapes in `openapi.yaml`)

### 4.1 Money
`type: string, pattern: ^\d{1,13}(\.\d{2})$` — serialized from integer cents. Never accept client totals: create/update payloads contain **no total field** (extra fields ignored).

### 4.2 JWT claims
`sub` (user id), `role`, `costCenterId` (nullable), `approverLevel` (nullable), `iat`, `exp` (=iat+900), `iss` (= env `JWT_ISSUER`), `jti`.

### 4.3 `RequestDetailDto` (GET /requests/:id — 200)
```json
{
  "id": "uuid", "requestNumber": "REQ-000042", "title": "...", "description": "...",
  "category": "EQUIPMENT", "status": "PENDING_APPROVAL",
  "total": "24499.50",
  "costCenter": {"id":"uuid","code":"CC-TI-01"},
  "owner": {"id":"uuid","name":"Maria"},
  "currentVersion": 1, "neededBy": "2026-12-01",
  "competenceMonth": "2026-11",
  "createdAt": "...", "submittedAt": "...", "decidedAt": null,
  "items": [ {"position":0,"description":"Notebook 16GB/512GB","quantity":5,"unitPrice":"4899.90","lineTotal":"24499.50"} ],
  "steps": [ {"sequence":1,"level":"NIVEL_1","status":"APPROVED","approver":{"id":"uuid","name":"João"},"decidedAt":"...","comment":"..."},
             {"sequence":2,"level":"NIVEL_2","status":"PENDING","approver":null,"decidedAt":null,"comment":null} ],
  "versions": [ {"versionNumber":1,"submittedAt":"..."} ],
  "allowedActions": ["APPROVE","REJECT","REQUEST_CHANGES","CANCEL"],
  "lockVersion": 7
}
```
For `DRAFT`: `items` = working copy, `steps`/`versions` empty, `competenceMonth` null, `currentVersion` 0.

### 4.4 `allowedActions` computation (server-side, FR-037)

Visibility reminder (A-26): a `DRAFT` renders for its owner only — `ADMIN` never sees another user's draft.

| Caller × status | Actions |
|---|---|
| owner × DRAFT | `EDIT, SUBMIT, CANCEL` |
| owner × CHANGES_REQUESTED | `EDIT, SUBMIT, CANCEL` |
| owner × PENDING_APPROVAL | `CANCEL` (never APPROVE-family — BR-001) |
| eligible approver × PENDING_APPROVAL (current step) | `APPROVE, REJECT, REQUEST_CHANGES` |
| ADMIN × PENDING_APPROVAL / CHANGES_REQUESTED (visible, not owner) | `CANCEL`; plus `APPROVE, REJECT, REQUEST_CHANGES` when eligible for the current step (e.g. the ADMIN step) |
| ADMIN × someone else's DRAFT | n/a — 404, the request is not visible |
| any × final states (APPROVED/REJECTED/CANCELLED) | `[]` |

The detail endpoint computes this list for the **current user**; the front-end renders buttons solely from it.

### 4.5 Transition request bodies
`{ "lockVersion": <int>, "comment": "<optional, string>" }` — `comment` required (≥10 chars) for `reject`/`request-changes`. Response: 200 + fresh `RequestDetailDto` (with incremented `lockVersion`).

### 4.6 Idempotency (POST /requests)
Header `Idempotency-Key` optional but honored: same (user, key) + same payload → **stored 201 replayed**; same key + different payload → `409 IDEMPOTENCY_PAYLOAD_MISMATCH`. TTL 24 h. Missing header → normal processing (no dedup). A replay carries the response header `Idempotent-Replayed: true` (fresh creates: `false`). No size cap is implemented on stored bodies.

### 4.7 Visibility & errors
- `GET` on a request outside visibility → `404 NOT_FOUND` (ADR-012).
- `SOLICITANTE` calling any approval mutation → `403 FORBIDDEN` (action-type check, before 409/422).
- Approval-time rule violations → `422` with the specific code and explanatory `detail` (BR-015); see `ERROR-CATALOG.md` for the exact precedence.

### 4.8 Dashboard summary (GET /dashboard/summary — 200)
```json
{
  "totals": [ {"status":"DRAFT","count":3}, {"status":"PENDING_APPROVAL","count":7}, ... ],
  "budgets": [ {"costCenterId":"uuid","code":"CC-TI-01","name":"TI","month":"2026-11",
                 "amount":"50000.00","consumed":"49200.00","available":"800.00"} ],
  "averageApprovalTimeDays": 2.4   // implemented ([D]); null when nothing was decided in the last 30 days
}
```
Scope: requester → own requests totals + own CC budget; approver → CC totals + own CC budget; ADMIN → all totals + all budgets (A-12).
The back end returns **every status, including zero counts**; the three aggregations run in parallel on virtual threads (`DashboardService`).

## 5. Validation rules (400 VALIDATION_FAILED)

| Payload | Rules |
|---|---|
| register | email format, password ≥ 8 (≥1 letter, ≥1 digit), name 2–120, **costCenterId required and must exist** (a new user has no "own" center — SEC-006/A-15) |
| create/update user | role enum; approverLevel required iff role=APROVADOR; costCenterId optional only for ADMIN |
| create/update request | title 3–120; description ≤ 2000; category enum; neededBy `YYYY-MM-DD` strictly after today (America/Sao_Paulo); items 1–50; item.description 1–255; quantity int 1–1 000 000; unitPrice decimal > 0 with ≤ 2 fraction digits, ≤ 13 integer digits |
| set budget | amount decimal ≥ 0, 2dp |
| transitions | `lockVersion` integer ≥ 1 (required). Comment is **structurally** validated only when present: string, ≤ 2000 chars. The ≥ 10-char rule is **business**, not schema: `CommentPolicy` enforces it for `reject`/`request-changes` and throws `422 COMMENT_REQUIRED` (README §2.3.4 keeps the approve comment optional — `"OK"` is legal). OpenAPI does **not** declare `minLength: 10` on `TransitionRequest.comment` |

Error body carries `errors[]` with `{field, message, code}` entries mapped 1:1 to form fields (FR-035/FR-039).

## 6. Idempotency-key handling (server recipe)

The key is **reserved in the same transaction as the create** — a committed request never exists without
its key row, so a racing retry can never produce a duplicate (A-32):

1. Header absent → proceed normally (no dedup).
2. `SELECT` the record for (user, key):
   - found, not expired, payload hash matches → **replay stored response verbatim**;
   - found, hash differs → `409 IDEMPOTENCY_PAYLOAD_MISMATCH`;
   - found, expired → treat as absent (overwrite path).
3. `BEGIN` the create transaction. **First write:** a conflict-tolerant placeholder reservation
   (exact SQL in TRANSACTION-STRATEGY §3.4):
   `INSERT … VALUES (…, 102, '{}'::jsonb, …) ON CONFLICT (user_id, idem_key) DO UPDATE SET … WHERE idempotency_keys.expires_at < now() RETURNING user_id`.
   - **1 row returned** → the key is ours (fresh key, or an expired row was taken over) → continue.
   - **0 rows returned** → a live record exists (a concurrent creator committed while we waited on the
     PK lock): `ROLLBACK` our transaction, then `SELECT` the committed record and handle it exactly as
     in step 2 (replay or 409).
   A plain `INSERT` that raises a unique violation must **not** be used: in PostgreSQL the error aborts
   the transaction, so no follow-up `SELECT` can run in it. If the concurrent winner rolled back, our
   insert proceeds and we become the creator.
4. Execute the create (aggregate + items + event) inside the same transaction; then `UPDATE` the key
   row with the real `response_status`/`response_body`.
5. `COMMIT` — request row and key row land atomically. Any failure rolls back both (the key is free again).
6. Stored response body capped at 64 KiB; expired rows purged lazily.

## 7. Concurrency conflict responses

`409 CONCURRENCY_CONFLICT` with `detail` like *"A solicitação foi alterada por outro usuário. Atualize e tente novamente (lockVersion atual: 8)."* and the current `lockVersion` in an extension field `currentLockVersion` (documented in openapi.yaml). The front-end refetches detail on 409 and re-renders.

## 8. Versioning strategy

No URL version. The contract is single-version; breaking changes would be introduced with a new document and deprecation headers. Justification: one deployment, one consumer (the SPA), 7-day challenge horizon (scope note in ADR-002).

## 9. Security headers & CORS

- CORS: none configured. In development the Vite proxy makes calls same-origin (`/api` → `http://localhost:3000`); the planned compose setup does the same with a proxy in front of the API.
- Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `Cache-Control: no-cache, no-store` come from Spring Security's defaults.
- Rate limiting on login: [D] differentiator — out of MVP scope.
