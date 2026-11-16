# Assumptions and Open Questions

> Every assumption below is a conscious decision where the challenge statement leaves freedom.
> Each is either confirmed by an ADR (see `docs/adr/`) or flagged as needing candidate confirmation.
> Nothing here contradicts `README.md`; where interpretation was needed, the README section is cited.

## A. Confirmed Architectural Assumptions (decided by this blueprint, documented in ADRs)

| # | Assumption | Rationale | ADR |
|---|---|---|---|
| A-01 | Back-end: **Java 25 + Spring Boot 4.1 + Spring Data JPA/Hibernate + Flyway**; front-end: **React 18 + Vite + TypeScript + Ant Design 5**; DB: **PostgreSQL 16**. *(Revised 2026-11-15: the plan said NestJS + TypeORM; the implementation uses Spring.)* | Permitted by §5.1; Spring gives declarative transactions (incl. `REQUIRES_NEW` for the post-rollback audit), Spring Data and resource-server JWT; Flyway satisfies NFR-003 | ADR-002 |
| A-02 | **Modular monolith** with strict layers: `domain` (pure TS) → `application` (services/use cases) → `infrastructure` (ORM, HTTP) | Matches the challenge size; satisfies NFR-004 (domain testable without HTTP/ORM); no distributed-systems overhead | ADR-001, ADR-003 |
| A-03 | Money stored as **integer cents** (`BIGINT`), serialized as decimal strings with 2 places (`"4899.90"`) | README leaves representation open ("Como representar… fica a seu critério"); avoids float rounding; matches the `"4899.90"` example | ADR-005 |
| A-04 | **Hybrid concurrency**: optimistic locking via `lock_version` on `purchase_requests` for all transitions **plus** atomic conditional UPDATE for budget consumption | README mandates an ADR justifying optimistic vs pessimistic; hybrid satisfies both `409`-on-stale-lock and never-negative balance | ADR-009 |
| A-05 | `lockVersion` accepted in the **request body** of transition endpoints (README's own example sends it in the body); `If-Match` support is optional | README allows either | ADR-009 |
| A-06 | Resources outside the caller's visibility return **404** (not 403) — existence is not leaked; authenticated users performing an action their role forbids get **403** | README requires a justified ADR for exactly this choice | ADR-012 |
| A-07 | **Versioning model**: `purchase_requests` holds the editable *working copy* (title, description, category, neededBy, items); each submit freezes an immutable `request_versions` + `version_items` snapshot with `competence_month` | Satisfies immutability + "resubmission creates the version" + competence re-derivation per version | ADR-011 |
| A-08 | Competence month is **computed at submit time** (`America/Sao_Paulo`) and persisted on the version; consumption reads the stored value | Deterministic replays, auditability; matches BR-007 | ADR-011 |
| A-09 | JWT **access token only** (15 min), no refresh token (refresh is a §6 differentiator) | README §2.1 only requires the short-lived JWT; keeps scope controlled | ADR-006 |
| A-10 | Auth token transport: `Authorization: Bearer`; logout is front-end-only (discard token) | Standard; no revocation requirement in README | ADR-006 |
| A-11 | **Global ADMIN** has `cost_center_id = NULL`; scoped users must belong to a cost center | README: "Todo usuário pertence a um centro de custo (costCenterId). O ADMIN pode ser global." | ADR-004 |
| A-12 | Dashboard budget scope: `ADMIN` sees all cost centers; `APROVADOR` and `SOLICITANTE` see **their own** cost center | README scopes totals by role but is silent on budget scope; own-CC is the least-privilege reading | ADR-013 (front-end) / SPEC-014 |
| A-13 | `neededBy` "future" = strictly after the current **business date** in `America/Sao_Paulo` | Timezone-safe definition | SPEC-006 |
| A-14 | Creating a request may target **any existing cost center** (default = requester's); visibility rules still apply | README says "padrão = o do solicitante", implying an optional override is accepted | SPEC-006 |
| A-15 | Registering users are bound to a cost center chosen at registration (existing center) or the first seeded center; simplest compliant option: registration requires an existing `costCenterId` | README is silent; a `SOLICITANTE` must belong to a CC | SPEC-003 |
| A-16 | History immutability enforced **in the database** (deny UPDATE/DELETE to the app role; optional trigger) — README §6 lists this as a differentiator; we adopt it because it is cheap and directly addresses an internal-audit framing ("auditoria interna exige rastreabilidade completa") | Risk reduction | ADR-011 |
| A-17 | `docker compose` (to be written) runs PostgreSQL 16, the back end from `backend/Dockerfile` (Temurin 25 JRE, non-root) and a production build of the front end (`VITE_MOCK_BACKEND=false`) behind a proxy; Flyway + seed run on back-end start-up, so no manual step | NFR-009 "sem nenhum passo manual" | ADR-014, INTEGRATION-CONTRACTS §4 |
| A-18 | Structured JSON logs via Spring Boot structured logging (`logging.structured.format.console=ecs`); `RequestIdFilter` puts `X-Request-Id` in the MDC (key `requestId`) and echoes it; generated as a UUID when absent or unsafe | NFR-007 | ADR-001 |
| A-19 | OpenAPI served by springdoc (Swagger UI at `/docs`, spec at `/v3/api-docs`, generated from the controllers); the committed `docs/api/openapi.yaml` stays the contract master (no automated diff yet) | FR-064 | SPEC-001 |
| A-20 | Business rule precedence inside the `422` stage follows §4.3 order: invalid transition → eligibility (role/level/CC) → segregation (self, duplicate) → comment → budget | README's explicit order "estado, nível, centro de custo, segregação, comentário, orçamento" | SPEC-008 / ERROR-CATALOG |
| A-21 | `ADMIN` step eligibility: **any** `ADMIN` account approves (global or scoped) | README: "`ADMIN`: somente `ADMIN`" — no CC restriction stated | SPEC-009 |
| A-22 | Seed uses fixed fictional credentials — every seed user has the password `Kingspan@123` (e.g. `admin1@kingspan.test`); listed in `backend/README.md` and to be repeated in `SOLUTION.md` | §5.4/§5.5 | SPEC-002 |
| A-23 | Pagination bounds: `size` 1–100, default 20; `page` 0-based; unknown sort fields → `400` | Defensive API contract | SPEC-006 |
| A-24 | Cancel by `ADMIN` of any visible request; cancel does not restore budget (only `APPROVED` consumes) | §4.2 allows cancel from the three non-final states by dono ou ADMIN | SPEC-008 |
| A-25 | Front-end stack details: Ant Design 5 (components, `Form`/`Form.List`, theme tokens), TanStack Query for server state, React Router for URL-reflected filters; an in-browser fake backend (`VITE_MOCK_BACKEND`, default `true`) so the UI runs without the API. *(Revised: the plan said react-hook-form + zod + plain CSS.)* | §7.2: framework choice not penalized | ADR-013 |
| A-26 | **Drafts are owner-only with no ADMIN exception.** Consequence for cancel (README §4.2 "dono ou ADMIN"): `ADMIN` can cancel any *visible* request — i.e. in `PENDING_APPROVAL`/`CHANGES_REQUESTED`. A `DRAFT` is invisible to `ADMIN` (404 at load), so DRAFT cancel is owner-only in practice. This is the only reading that keeps §2.2 and §4.2 simultaneously true | §2.2 vs §4.2 | ADR-012 |
| A-27 | **Ownership violations are `403 NOT_REQUEST_OWNER`** (authenticated, action type allowed, but this resource belongs to someone else): non-owner edit/submit → 403; non-owner non-ADMIN cancel → 403. Evaluated after visibility (404) and action-type role (403 FORBIDDEN), before `lockVersion` (409) | §4.3 pipeline | ADR-012, ERROR-CATALOG |
| A-28 | **The cost center is part of the version snapshot.** `request_versions` carries `cost_center_id`, frozen at submit; budget consumption charges the *version's* cost center. The working copy may change `costCenterId` while in `DRAFT`/`CHANGES_REQUESTED` — that only affects the *next* version, never the frozen ones (preserves README §2.3.6 immutability). **Visibility and eligibility after a change:** an `APROVADOR` sees a request while its **current** cost center (`purchase_requests.cost_center_id`) is theirs — README §2.2 "o APROVADOR vê as do seu centro de custo". So if the owner moves a returned request from CC-A to CC-B, CC-A approvers lose access to it from then on (the owner, `ADMIN` and CC-B approvers keep full access, including v1 and its history, which still name CC-A and its approvers). Step eligibility always uses the **current version's** frozen cost center; while `PENDING_APPROVAL` this equals the working copy, because edits are only allowed in `DRAFT`/`CHANGES_REQUESTED`. Rejected alternative: "visible to every center that appears in any version" — it complicates every list/count query for a rare case | §2.3.6 | ADR-011, ERD-PHYSICAL §6 |
| A-29 | **Average approval time** = `decided_at − first submission instant`, where the first submission is the earliest `SUBMITTED`/`RESUBMITTED` event of the request (events are the source of truth; avoids skew from `submitted_at` being the *last* submission) | §6 differentiator | SPEC-014 |
| A-30 | **Pagination is clamped, never 400:** `page < 0 → 0`, `size` outside 1–100 → clamped to nearest bound (shareable URLs stay robust). Unknown sort field/direction remains `400 INVALID_SORT` (programmer error) | §3.2 envelope robustness | API-DESIGN §2 |
| A-31 | **Steps record outcomes, not just approvals.** `approval_steps.status` ∈ `PENDING \| APPROVED \| REJECTED \| RETURNED \| CANCELLED \| SKIPPED`: on reject the current step → `REJECTED`; on request-changes → `RETURNED`; on cancel of a `PENDING_APPROVAL` request → `CANCELLED`; in the same transaction every later still-`PENDING` step of that version → `SKIPPED` (never reached). Invariant: once a version stops being the active chain, **none of its steps is `PENDING`**. `approver_id` stays NULL for `CANCELLED`/`SKIPPED` (the canceller is in the event). Detail/version views then show the truthful chain (README §2.7) | §2.7 detail requirements | SPEC-008, ERD-PHYSICAL §8 |
| A-32 | **Idempotency key is reserved in the same transaction as the create**: placeholder `INSERT … ON CONFLICT (user_id, idem_key) DO UPDATE … WHERE expires_at < now() RETURNING` first; the losing racer blocks on the PK, gets 0 rows (no error, so the PG transaction is not aborted), rolls back and replays the winner's committed record; expired keys are taken over by the same statement. Request row + key row commit atomically — a "discard ours after commit" is impossible by construction | §3.2 | ADR-010, TRANSACTION-STRATEGY §3.4 |
| A-33 | **Seed consumed amount is backed by real APPROVED requests** (dashboard totals add up), and the >R$10.000 video-flow request lives in `CC-ADM-02` so the near-exhausted `CC-TI-01` still demonstrates `BUDGET_EXCEEDED` | §5.4 | SPEC-002, INTEGRATION-CONTRACTS §6 |

## B. Open Questions (non-blocking; resolved by the assumptions above)

| # | Question | Provisional answer |
|---|---|---|
| Q-01 | May a `SOLICITANTE` create a request for a cost center other than their own? | Yes (A-14), any existing CC |
| Q-02 | Should the inbox show requests of other cost centers to an `ADMIN`? | Yes — `ADMIN` sees everything; inbox applies segregation (not own requests, not already-approved steps) |
| Q-03 | What happens to the inbox entry after a step is approved by someone else? | It disappears (current step recalculated); the stale UI gets `409` on action — matches FR-039 |
| Q-04 | Is `POST /requests` idempotency scoped per user? | Yes: same key by a different user is a different idempotency record (README: "do mesmo usuário") |
| Q-05 | Are transitions themselves idempotent (retry with same key)? | Not implemented (differentiator FR-024). A retried transition carries a stale `lockVersion` and gets 409 — the minimal safe behavior |
| Q-06 | Does rejection/return consume budget? | No — only final approval consumes (BR-006) |
| Q-07 | Can an approver edit items of a request? | No — editing is owner-only in `DRAFT`/`CHANGES_REQUESTED` (FR-009) |
| Q-08 | Which month does the dashboard show? | Current month (`America/Sao_Paulo`) per §2.6 |
| Q-09 | Should history include events with system actor (e.g. seed)? | The seed acts through real seed users, so its events have real actors; `x_request_id` is `seed`. `actor_id` stays nullable for future system actions |
| Q-10 | Exactly 24 h idempotency TTL or longer? | 24 h minimum implemented; expired keys are purged lazily and reusable afterwards |

## C. Explicitly Out of Scope (documented, not silently dropped)

- Refresh tokens, SLA job, transactional outbox, Prometheus/OTel, login rate limiting, accessibility pass, public deploy — README §6 differentiators, not implemented. (E2E tests — also a §6 differentiator — **were** implemented, with Cypress, in the front end.) The blueprint leaves extension seams (see SPEC-014/SPEC-019 "Extension points") but does not schedule them.
- Admin front-end screens — README §2.7 says they are not required; SPEC-018 exists so the API is complete and the UI can be added cheaply.
- Notification delivery — none required.

## D. Ambiguities Resolved in Favor of the Statement

- §4.3 order "existência/visibilidade → 404 (ou 403, conforme seu ADR)" before "papel permite → 403": the blueprint applies **visibility first** (404 when the resource is invisible), then **action-type authorization** (403). ADR-012.
- §2.3 rule 5 says failures keep the request pending: a failed final approval due to budget does **not** change status. Audit of the failed attempt: the transition transaction **rolls back entirely** (including the lock bump); the `APPROVAL_FAILED_BUDGET` event is then written in a **separate short transaction**. Rationale: the lock update is the first write, so a racing second approver receives 409 (README §2.3.5), never 422 — committing the failure inside the failed transition would persist the lock bump and a false audit row on a request that may already be APPROVED. Documented in SPEC-008/SPEC-011/SPEC-012 and TRANSACTION-STRATEGY §4.

## E. Implementation deviations (recorded 2026-11-15)

| # | Deviation from the plan | Why | Where |
|---|---|---|---|
| D-01 | Spring Boot (Java 25) instead of NestJS; Ant Design instead of react-hook-form + zod + plain CSS | candidate's choice during implementation | ADR-002, ADR-013 |
| D-02 | Bean validation answers **400 before** the 404/403 stages (e.g. a body without `lockVersion`) | request-body validation runs before the controller method | ERROR-CATALOG §3 note |
| D-03 | The seed is "skip if present, one transaction" instead of per-row insert-if-absent | same guarantees (no re-seed, no updates), simpler | `database/migrations/README.md` |
| D-04 | `GET /cost-centers` is public | the public sign-up form needs the list of centers | API-DESIGN §3 |
| D-05 | `/health` uses the Actuator format (`{status, components:{db:…}}`) | standard Spring Boot health | openapi `HealthDto` |
| D-06 | Front-end tests are Cypress end-to-end tests against an in-browser fake backend; no component tests | the API was not runnable while the UI was built | ADR-013, ADR-014 |
| D-07 | The fake backend duplicates business rules in the client | stand-in for the server only; must be retired or kept in sync | ADR-013 |

