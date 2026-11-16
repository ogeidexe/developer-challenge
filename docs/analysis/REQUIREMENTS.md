# Requirements Catalog — Purchase Request System (Kingspan Pleno Challenge)

> Source of truth: `README.md` of the `teste-pleno` branch (challenge statement, Portuguese).
> Detailed, test-oriented specs (numbered rules, Given/When/Then acceptance criteria, HTTP codes, code and test
> locations, coverage gaps) live in [`docs/RFs/`](../RFs/README.md); they reference the IDs defined here.
> Requirements are stack-independent; where each one is implemented and tested: `TRACEABILITY-MATRIX.md`.
> Every identifier below is stable and cross-referenced by the traceability matrix, specifications, tests and ADRs.
> Classification: **FR** functional · **BR** business rule · **NFR** non-functional · **SEC** security ·
> **DATA** data integrity · **INT** integration · **INF** infrastructure · **QA** testing/quality ·
> **SUB** submission/evaluation · **TR** technical constraint.
>
> Status: `[M]` mandatory (explicit in the challenge) · `[D]` differentiator/optional · `[A]` architectural recommendation derived from a mandatory requirement.

---

## 1. Functional Requirements

### 1.1 Authentication and users (README §2.1)

| ID | Requirement | Src | Status |
|---|---|---|---|
| FR-001 | Public registration (`POST /auth/register`) creates **only** `SOLICITANTE` accounts | §2.1 | [M] |
| FR-002 | Login (`POST /auth/login`) returns a short-lived JWT (example: 15 min); minimum claims `sub`, `role`, `costCenterId`, `approverLevel` (when present) | §2.1 | [M] |
| FR-003 | `GET /auth/me` returns the logged-in user's data | §2.1 | [M] |
| FR-004 | Passwords stored with strong hash (bcrypt/argon2); password or hash never returned in any response | §2.1 | [M] |
| FR-005 | `ADMIN` creates and edits users of any role and level (`GET/POST /users`, `PATCH /users/:id`) | §2.1, §3.1 | [M] |

### 1.2 Purchase requests (README §2.2)

| ID | Requirement | Src | Status |
|---|---|---|---|
| FR-006 | Request fields: `title`, `description`, `category`, `costCenterId` (default = requester's), `neededBy` (optional, must be a future date), `items[]` with `description`, `quantity` (integer > 0), `unitPrice` (> 0) | §2.2 | [M] |
| FR-007 | `category` enum: `EQUIPMENT \| SERVICES \| SUPPLIES \| TRAVEL \| SOFTWARE \| OTHER` | §2.2 | [M] |
| FR-008 | Total amount calculated **in the back-end**: item = `quantity × unitPrice`; total = Σ items; currency BRL; client-sent value ignored | §2.2 | [M] |
| FR-009 | Request is born as `DRAFT`; editable only in `DRAFT` or `CHANGES_REQUESTED`, and only by the owner | §2.2 | [M] |
| FR-010 | List endpoint with pagination, sorting and filters: `status`, `category`, `costCenterId`, `createdFrom`, `createdTo` | §2.2 | [M] |
| FR-011 | Visibility: `SOLICITANTE` sees own requests; `APROVADOR` sees own cost-center requests; `ADMIN` sees all **non-draft** requests. `DRAFT` is visible **only to its owner — no exception, including `ADMIN`** (README §2.2: "Rascunhos (DRAFT) só são visíveis para o dono") | §2.2 | [M] |
| FR-012 | Extra list filters `minAmount`, `maxAmount`, `q` (title search) | §6 | [D] |

### 1.3 Approval chain (README §2.3)

| ID | Requirement | Src | Status |
|---|---|---|---|
| FR-013 | On submit, the system builds the step chain **for that version** of the request; steps are approved strictly in order | §2.3 | [M] |
| FR-014 | Chain by total value: ≤ R$1,000.00 → `NIVEL_1`; R$1,000.01–R$10,000.00 → `NIVEL_1 → NIVEL_2`; > R$10,000.00 → `NIVEL_1 → NIVEL_2 → ADMIN` | §2.3 | [M] |
| FR-015 | Category `SOFTWARE` always ends with an `ADMIN` step, even below R$10,000; `ADMIN` step never duplicated | §2.3 | [M] |
| FR-016 | Step eligibility: `NIVEL_1` → `APROVADOR` (`NIVEL_1` or `NIVEL_2`) of same cost center, or `ADMIN`; `NIVEL_2` → `APROVADOR` `NIVEL_2` of same cost center, or `ADMIN`; `ADMIN` → only `ADMIN` | §2.3 | [M] |
| FR-017 | Segregation of duties: nobody approves their own request; the same person cannot approve two steps of the same version | §2.3 | [M] |
| FR-018 | Comment optional on approve; **mandatory (min 10 chars)** on reject or request-changes | §2.3 | [M] |
| FR-019 | Final-step approval consumes the cost-center budget in the **competence month** = month of submission of the current version (tz `America/Sao_Paulo`); a resubmission in another month changes competence | §2.3 | [M] |
| FR-020 | Month without registered budget has zero balance; insufficient balance → approval fails with `422 BUDGET_EXCEEDED` and the request stays pending | §2.3 | [M] |
| FR-021 | Balance never negative, including simultaneous approvals: same step of same request concurrently → exactly one succeeds, the other gets `409`; final approvals of different requests competing for the same balance → those that fit are approved, others get `422 BUDGET_EXCEEDED` | §2.3 | [M] |
| FR-022 | Return for adjustment (`request-changes`) → `CHANGES_REQUESTED`; owner edits and resubmits; resubmission creates a **new version** (v2, v3…); previous version is immutable and queryable; chain recalculated from scratch; prior approvals do not count | §2.3 | [M] |
| FR-023 | No eligible approver for the current step (e.g. `ADMIN` step and the only admin is the owner) → step stays pending in the inbox; this is **not an error** | §2.3 | [M] |
| FR-024 | Idempotency on transition actions (approve/reject/request-changes/cancel/submit) | §6 | [D] |

### 1.4 Approval inbox, history, dashboard (README §2.4–2.6)

| ID | Requirement | Src | Status |
|---|---|---|---|
| FR-025 | `GET /approvals/inbox` lists requests whose **current step** the logged-in user can approve **now**, already applying cost center, level and segregation of duties | §2.4 | [M] |
| FR-026 | Every action generates an append-only event (never altered or deleted) with: actor, actor role, action, origin and destination status, step, version, comment, UTC timestamp and the request's `X-Request-Id` | §2.5 | [M] |
| FR-027 | History is queryable per request (`GET /requests/:id/history`) | §2.5, §3.1 | [M] |
| FR-028 | Dashboard totals by status, scoped by role (requester = own; approver = cost center; admin = all) | §2.6 | [M] |
| FR-029 | Dashboard shows current-month budget per cost center: budgeted, consumed, available | §2.6 | [M] |
| FR-030 | Average approval time in dashboard (submission → final decision, last 30 days) | §6 | [D] |

### 1.5 Web interface (README §2.7)

| ID | Requirement | Src | Status |
|---|---|---|---|
| FR-031 | Login screen, role-protected routes, expired-session handling (`401` → login → return to origin route) | §2.7 | [M] |
| FR-032 | Dashboard screen (FR-028/029) | §2.7 | [M] |
| FR-033 | List screen with server-side pagination/sorting/filtering reflected in the URL (shareable link) | §2.7 | [M] |
| FR-034 | Approval inbox screen (FR-025) | §2.7 | [M] |
| FR-035 | Create/edit form with dynamic items and real-time total display (display only — back-end computes); server validation errors mapped to fields | §2.7 | [M] |
| FR-036 | Detail screen with data, versions, approval chain (step, who approved, when) and history timeline | §2.7 | [M] |
| FR-037 | Contextual actions driven by `allowedActions` from the API detail response; the front-end must **not** reimplement permission rules | §2.7 | [M] |
| FR-038 | Mandatory-comment modal for reject and request-changes | §2.7 | [M] |
| FR-039 | Clear messages for `409` (someone acted first) and `422` (business rule); loading, empty and error states | §2.7 | [M] |
| FR-040 | Admin screens (users, cost centers, budgets) **not** required — API + seed are sufficient | §2.7 | [M] (negative scope) |

### 1.6 REST endpoints (README §3.1)

All endpoints below are mandatory. Contracts live in `docs/api/openapi.yaml`.

| ID | Endpoint | Requirement |
|---|---|---|
| FR-041 | `POST /auth/register` | Public registration (FR-001) |
| FR-042 | `POST /auth/login` | Login (FR-002) |
| FR-043 | `GET /auth/me` | Logged user (FR-003) |
| FR-044 | `GET /users` · `POST /users` | List/create users, `ADMIN` (FR-005) |
| FR-045 | `PATCH /users/:id` | Edit role/level/cost center, `ADMIN` (FR-005) |
| FR-046 | `GET /cost-centers` | List cost centers |
| FR-047 | `POST /cost-centers` | Create cost center, `ADMIN` |
| FR-048 | `GET /cost-centers/:id/budgets/:yyyy-mm` | Query monthly budget |
| FR-049 | `PUT /cost-centers/:id/budgets/:yyyy-mm` | Set monthly budget, `ADMIN`; below consumed → `422 BUDGET_BELOW_CONSUMED` |
| FR-050 | `GET /requests` | Paginated/filterable/sortable list (FR-010) |
| FR-051 | `POST /requests` | Create in `DRAFT`, accepts `Idempotency-Key` |
| FR-052 | `GET /requests/:id` | Current-version detail + steps + `allowedActions` + `lockVersion` |
| FR-053 | `PUT /requests/:id` | Edit (`DRAFT` / `CHANGES_REQUESTED`) |
| FR-054 | `GET /requests/:id/versions` · `GET /requests/:id/versions/:n` | Version list and specific version |
| FR-055 | `POST /requests/:id/submit` | Submit or resubmit |
| FR-056 | `POST /requests/:id/approve` | Approve current step |
| FR-057 | `POST /requests/:id/reject` | Reject (comment mandatory) |
| FR-058 | `POST /requests/:id/request-changes` | Return for adjustment (comment mandatory) |
| FR-059 | `POST /requests/:id/cancel` | Cancel (owner or `ADMIN`) |
| FR-060 | `GET /requests/:id/history` | Event history (FR-027) |
| FR-061 | `GET /approvals/inbox` | Approval inbox (FR-025) |
| FR-062 | `GET /dashboard/summary` | Dashboard data (FR-028/029) |
| FR-063 | `GET /health` | Health including database |
| FR-064 | OpenAPI documentation available in-app (e.g. `/docs`) | §3.1 |

---

## 2. Business Rules

| ID | Rule | Src | Status |
|---|---|---|---|
| BR-001 | A requester can never approve their own request (`SELF_APPROVAL_FORBIDDEN`) | §2.3 | [M] |
| BR-002 | The same person cannot approve two steps of the same request version (`DUPLICATE_APPROVER`) | §2.3 | [M] |
| BR-003 | Reject/request-changes requires comment with ≥ 10 characters (`COMMENT_REQUIRED`) | §2.3 | [M] |
| BR-004 | Value boundaries are exact: total ≤ 100000 cents → `NIVEL_1`; 100001–1000000 cents → `NIVEL_1→NIVEL_2`; > 1000000 cents → `NIVEL_1→NIVEL_2→ADMIN` | §2.3 | [M] |
| BR-005 | `SOFTWARE` category appends a final `ADMIN` step; `ADMIN` never appears twice in a chain | §2.3 | [M] |
| BR-006 | Budget is consumed **only** on final-step approval, in the **same transaction** as the state transition | §2.3, §4.2 | [M] |
| BR-007 | Competence month = month of submission of the current version, in `America/Sao_Paulo`; a resubmission in a different month changes the competence month | §2.3 | [M] |
| BR-008 | A month without budget registered has zero balance (never auto-created) | §2.3 | [M] |
| BR-009 | Budget balance can never go negative, even under concurrent final approvals | §2.3 | [M] |
| BR-010 | Resubmission creates a new version; previous versions are immutable and remain queryable | §2.3 | [M] |
| BR-011 | History events are append-only: never updated, never deleted | §2.5 | [M] |
| BR-012 | `neededBy`, when provided, must be a date in the future | §2.2 | [M] |
| BR-013 | Drafts (`DRAFT`) are visible only to their owner | §2.2 | [M] |
| BR-014 | Verification order determines HTTP status: authentication → existence/visibility → role → `lockVersion` → business rule | §4.3 | [M] |
| BR-015 | Business-rule error messages must explain the reason (e.g. *"Não é possível aprovar: você já aprovou a etapa NIVEL_1 desta versão (segregação de funções)."*) | §4.3 | [M] |
| BR-016 | States `APPROVED`, `REJECTED`, `CANCELLED` are final — every action on them is blocked | §4.2 | [M] |
| BR-017 | Only the owner edits a request; only owner or `ADMIN` cancels it | §4.2 | [M] |
| BR-018 | Cancel is allowed from `DRAFT`, `PENDING_APPROVAL`, `CHANGES_REQUESTED` | §4.2 | [M] |

---

## 3. Non-Functional Requirements (all mandatory, README §5)

| ID | Requirement | Src |
|---|---|---|
| NFR-001 | Back-end in Node.js (NestJS/Express/Fastify) **or** Java Spring Boot | §5.1 |
| NFR-002 | Relational database; PostgreSQL recommended | §5.1 |
| NFR-003 | Versioned migrations (Flyway/Liquibase/Prisma/TypeORM/Knex…) and automatic seed | §5.1, §5.4 |
| NFR-004 | Domain rules isolated from HTTP and ORM: state machine and chain building testable without server or database | §5.1 |
| NFR-005 | Dates persisted in UTC | §5.1 |
| NFR-006 | Explicit transactions on transitions; concurrency control (optimistic or pessimistic) chosen and justified in ADR | §5.1 |
| NFR-007 | Structured JSON logs with `X-Request-Id` (generated when absent, returned in the response) | §5.1 |
| NFR-008 | Configuration via environment variables; no committed secrets | §5.1 |
| NFR-009 | `docker compose up --build` at the repo root brings up database + back-end + front-end and runs migrations and seed with no manual steps | §5.3 |
| NFR-010 | `.env.example` with all required variables | §5.3 |
| NFR-011 | CI pipeline (GitHub Actions) on the fork with build, lint and tests for both sides, green on the final commit; Actions enabled on the fork | §5.3 |
| NFR-012 | Lint/format run in CI or as project scripts; tools that alter git hooks (husky, lefthook, pre-commit) are forbidden | §5.3, §10 |
| NFR-013 | Unit tests of state machine and chain construction covering **all** transitions of table §4.2 including invalid ones (parameterized/table-driven welcome) | §5.2 |
| NFR-014 | Database integration tests (Testcontainers or compose DB) covering, at minimum: full 3-step flow to `APPROVED` with budget consumption; segregation of duties (self-approval and duplicate approver); `BUDGET_EXCEEDED`; return → edit → resubmit creating v2 with v1 preserved; idempotency of `POST /requests` | §5.2 |
| NFR-015 | Automated concurrency tests: simultaneous approvals of the same step → exactly one succeeds, other `409`; simultaneous final approvals of different requests sharing a balance → balance never negative, losers get `422 BUDGET_EXCEEDED` | §5.2 |
| NFR-016 | At least 3 significant front-end tests (e.g. items form, actions rendered from `allowedActions`, `409`/`422` handling) | §5.2 |
| NFR-017 | Each side runs its tests with a single documented command | §5.2 |
| NFR-018 | Errors in `application/problem+json` (RFC 9457) with `type`, `title`, `status`, `detail`, machine-readable `code`, and `errors[]` for validation cases | §3.2 |
| NFR-019 | Pagination convention `?page=0&size=20&sort=createdAt,desc` → `{ data, page, size, totalElements, totalPages }` | §3.2 |
| NFR-020 | Dates in ISO 8601 with timezone | §3.2 |
| NFR-021 | Every transition action (`submit`, `approve`, `reject`, `request-changes`, `cancel`) requires the current `lockVersion` (body, `If-Match` or `ETag`); mismatch → `409`. `lockVersion` (concurrency) ≠ request version (v1, v2…) | §3.2 |
| NFR-022 | `POST /requests` idempotency: same `Idempotency-Key` + same user + same payload → same response without creating a duplicate (validity ≥ 24 h); reused key with different payload → `409` | §3.2 |
| NFR-023 | Sorting whitelist and pagination bounds enforced by the API | §3.2 [A] |
| NFR-024 | The API must never expose stack traces or internals in error responses | §3.2 [A] |

---

## 4. Security Requirements

| ID | Requirement | Src | Status |
|---|---|---|---|
| SEC-001 | Only authenticated users access any endpoint except `/auth/register`, `/auth/login`, `/health` and OpenAPI docs | §2.1 [A] | [M] |
| SEC-002 | Invalid/expired token → `401`; front-end redirects to login | §3.2, §2.7 | [M] |
| SEC-003 | Role enforcement server-side: `SOLICITANTE` attempting to approve → `403`; approval allowed only per FR-016 | §3.2 | [M] |
| SEC-004 | Admin-only mutations: `POST /users`, `PATCH /users/:id`, `POST /cost-centers`, `PUT …/budgets/:yyyy-mm` | §3.1 | [M] |
| SEC-005 | Passwords hashed (bcrypt/argon2); hash never serialized | §2.1 | [M] |
| SEC-006 | Registration endpoint always creates `SOLICITANTE` with `approverLevel=null`; role/level fields in the payload are ignored. The registrant **must inform an existing `costCenterId`** (a new user has no "own" center yet — README §2.3: "Todo usuário pertence a um centro de custo") | §2.1, §2.3 | [M] |
| SEC-007 | JWT secret and DB credentials only via environment; nothing sensitive committed | §5.1 | [M] |

---

## 5. Data Integrity Requirements

| ID | Requirement | Src |
|---|---|---|
| DATA-001 | Budget consumption is transactionally consistent with the approval (same transaction, atomic conditional update) | §2.3, §4.2 |
| DATA-002 | Balance never negative, including under concurrent writers | §2.3 |
| DATA-003 | Request versions are immutable snapshots (no UPDATE path in application; DB hardened) | §2.3 |
| DATA-004 | History events are append-only (application never updates/deletes; DB hardened) | §2.5 |
| DATA-005 | Monetary values stored with exact precision (integer cents; no binary floating point) | §2.2 [A] |
| DATA-006 | State transitions occur only through the valid transition table (§4.2) | §4.2 |
| DATA-007 | Idempotency records guarantee at-most-once creation per key/user/payload | §3.2 |
| DATA-008 | Approval steps of a version are ordered and approved exactly once each | §2.3 [A] |
| DATA-009 | Chain construction is deterministic for a given (total, category) | §2.3 [A] |

---

## 6. Integration Requirements

| ID | Requirement | Src |
|---|---|---|
| INT-001 | Back-end persists exclusively in PostgreSQL via the chosen ORM; no other storage | §5.1 [A] |
| INT-002 | Front-end consumes only the REST API (no duplicated business rules) | §1, §2.7 |
| INT-003 | OpenAPI 3.1 contract served in-app and kept in sync with implementation | §3.1 |
| INT-004 | `docker compose` wires front-end → back-end → database with healthchecks | §5.3 [A] |

---

## 7. Infrastructure and Deployment Requirements

| ID | Requirement | Src |
|---|---|---|
| INF-001 | Root `docker-compose.yml` orchestrating PostgreSQL, back-end and front-end | §5.3, §8 |
| INF-002 | CI workflow(s) under `.github/workflows/` running build, lint and tests for both sides | §5.3 |
| INF-003 | `.env.example` at the repo root enumerating every environment variable | §5.3 |
| INF-004 | **Repository rules compliance** (eliminatory): protected files untouched; work only in allowed paths; AI change-log recording via `.agents/hooks/ai-log.sh`; commit trailers `AI-Assisted: yes` + `AI-Agent: <agent>`; no tools that change `core.hooksPath` | §10, AGENTS.md |
| INF-005 | Health endpoint verifies database connectivity | §3.1 |
| INF-006 | Structured JSON logging with request correlation id end-to-end | §5.1 |

---

## 8. Testing and Quality Requirements

| ID | Requirement | Src |
|---|---|---|
| QA-001 | Unit tests of the state machine covering all valid and invalid transitions, table-driven | §5.2 |
| QA-002 | Unit tests of chain construction (value boundaries, `SOFTWARE` rule, no duplicate `ADMIN`) | §5.2 |
| QA-003 | Integration tests against a real database (Testcontainers) covering the five minimum scenarios of NFR-014 | §5.2 |
| QA-004 | Automated concurrency tests per NFR-015 | §5.2 |
| QA-005 | ≥ 3 significant front-end component/logic tests | §5.2 |
| QA-006 | One-command test runs for back-end and front-end, documented (implemented: `./mvnw test` and `npm run test:e2e`) | §5.2 |
| QA-007 | Lint and format checks executed in CI or via project scripts | §5.3 |
| QA-008 | Business-rule error messages verified by assertions in API tests | §4.3 |

---

## 9. Submission and Evaluation Requirements

| ID | Requirement | Src |
|---|---|---|
| SUB-001 | Deliverable is a **public fork** keeping branch `teste-pleno` (unselect "Copy the main branch only"); no PR to the original repo | §8 |
| SUB-002 | `./setup.sh` executed before the first commit (Git Bash on Windows) | §8, §10.1 |
| SUB-003 | `SOLUTION.md` at fork root: solution overview, how to run (compose and local), seed users, main decisions/trade-offs, what was left out, what would be done with more time | §5.5 |
| SUB-004 | `docs/adr/` with **at least 3 ADRs**, necessarily: (a) concurrency strategy, (b) versioning/history modeling, (c) `403` vs `404` for resources outside visibility | §5.5 |
| SUB-005 | `AI_USAGE.md` written by the candidate (AI agents must not write it) | §5.5, §9.3 |
| SUB-006 | `backend/README.md` and `frontend/README.md` with prerequisites, variables, build/test/run commands and example requests | §5.5 |
| SUB-007 | Small, coherent Conventional Commits; a single giant commit is a negative signal | §5.6 |
| SUB-008 | Mandatory 15–25 min video following the operational flow (create > R$10,000 request → N1 → N2 → ADMIN → budget consumed; second request returned/edited/resubmitted as v2; refusal cases) | §8.1 |
| SUB-009 | Evaluation audit: protected files intact, AI log coherent, commit trailers present; violations are disqualifying | §7.1, §10.3 |
| SUB-010 | Code layout: `backend/`, `frontend/`, `docs/adr/`, `.github/workflows/`, `docker-compose.yml`, `.env.example`, `SOLUTION.md`, `AI_USAGE.md` | §8, §10.4 |

---

## 10. Explicit Non-Requirements / Out of Scope

| Item | Source |
|---|---|
| Admin screens in the front-end (API + seed suffice) | §2.7 |
| Sophisticated visual design (clarity and usability are enough) | §7.2 |
| Refresh tokens, SLA job, transactional outbox, E2E tests, metrics, rate limiting, accessibility, public deploy — all **diferenciais**, optional | §6 |
| Choice among the permitted frameworks is not penalized | §7.2 |

---

## 11. Requirement Count Summary

| Class | Count |
|---|---|
| FR | 64 |
| BR | 18 |
| NFR | 24 |
| SEC | 7 |
| DATA | 9 |
| INT | 4 |
| INF | 6 |
| QA | 8 |
| SUB | 10 |
| **Total** | **150** |
