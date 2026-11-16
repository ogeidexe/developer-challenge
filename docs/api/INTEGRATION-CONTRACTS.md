# Integration Contracts

> Contracts between the front end, the back end, the database and the delivery tooling — as implemented,
> with what is still missing called out explicitly.

## 1. Front-end ↔ Back-end contract

| Aspect | Contract |
|---|---|
| Transport | HTTP/JSON. Dev: the Vite proxy forwards `/api/*` to `http://localhost:3000` (prefix stripped). `VITE_MOCK_BACKEND=true` (default) replaces the network with the in-browser fake backend |
| Authentication | `Authorization: Bearer <JWT>`; token from `POST /auth/login` (`{token, tokenType, expiresIn, user}`); 15 min validity; stored in `sessionStorage` |
| Correlation | `X-Request-Id` sent by the client on every call (`crypto.randomUUID()`), echoed by the server (generated when absent or unsafe) |
| Errors | `application/problem+json` per ERROR-CATALOG.md; the client branches on `status`/`code` (`ApiError`), maps `errors[]` onto form fields, shows `detail` verbatim for 409/422 |
| Money | decimal strings with 2 fraction digits; the client never computes business totals (the form total is display only) |
| Dates | ISO 8601 with offset; `neededBy` / `createdFrom` / `createdTo` as `YYYY-MM-DD` |
| Pagination | `page/size/sort` + envelope `{data, page, size, totalElements, totalPages}`; out-of-range page/size are clamped |
| Actions | rendered **only** from `allowedActions`; comment modal for `REJECT`/`REQUEST_CHANGES`; every transition body carries the freshest `lockVersion` |
| Retries | `POST /requests` uses one `Idempotency-Key` per form session; a replay answers `Idempotent-Replayed: true`. Transition retries get 409 and refetch |

## 2. Back-end internal contracts

| Producer → Consumer | Contract |
|---|---|
| `domain` → `application` | Static pure functions and records; inputs are `Actor`, `StepState`, `Money`, enums — never entities; failures are the sealed `DomainException` subtypes with an `ErrorCode` |
| `persistence` → `application` | Spring Data repositories. Concurrency-relevant writes are explicit methods: `PurchaseRequestRepository.claim`, `BudgetRepository.consume` / `lockByCostCenterAndMonth`, `ApprovalStepRepository.decide` / `skipAfter`, `RequestItemRepository.deleteByRequestId` |
| `TransitionFacade` → `TransitionService` | The facade is not transactional; it calls the transactional service and, on `BudgetExceeded`, records `APPROVAL_FAILED_BUDGET` with `AuditService.recordBudgetFailure` (`REQUIRES_NEW`) after the rollback |
| `application` → `AuditService` | `record(...)` is `Propagation.MANDATORY`: an event is written only inside the action's transaction |
| `security` → controllers | `CurrentUser.get()` returns the `Actor` re-loaded from the database (inactive or missing → 401) |
| `IdempotencyService` → `PurchaseRequestService` | Wraps only `POST /requests`; reserves the key and creates the request in one `TransactionTemplate` transaction |

## 3. Database contract

| Aspect | Contract |
|---|---|
| Schema | The 10 tables + sequence of ERD-PHYSICAL.md, created only by Flyway `V1`–`V6`; Hibernate `ddl-auto: none` |
| Access | JPA entities and Spring Data repositories; `JdbcClient` SQL only in `IdempotencyService`; native/JPQL bulk statements only in the repository methods listed in §2 |
| Money | `bigint` cents; converted to decimal strings only in the DTO mapping |
| Time | UTC in (`Instant`, `jdbc.time_zone=UTC`), ISO-8601 out; `competence_month` computed in `America/Sao_Paulo` |
| Immutability | `request_events`, `request_versions`, `version_items`: `@Immutable` entities **and** `BEFORE UPDATE OR DELETE` triggers |

## 4. Docker compose contract — **not implemented yet**

Required by README §5.3. Target:

| Service | Contract |
|---|---|
| `db` | `postgres:16`; `POSTGRES_USER/PASSWORD/DB`; healthcheck `pg_isready`; named volume |
| `backend` | built from `backend/Dockerfile` (exists: Temurin 25, non-root, port 3000); env from `.env.example`; Flyway + seed run on start; `depends_on: db (healthy)` |
| `frontend` | multi-stage build with `VITE_MOCK_BACKEND=false` + a static server/proxy forwarding `/api` to `backend:3000` (prefix stripped) |
| One command | `docker compose up --build` reaches a working, seeded system (NFR-009) |

## 5. CI contract — **not implemented yet**

Target `.github/workflows/ci.yml` on push/PR: job `backend` (`./mvnw verify` — unit + Testcontainers
integration/concurrency) and job `frontend` (`npm ci`, `npm run build`, `npm run test:e2e`). Green on the
final commit (NFR-011). No workflow may alter git hooks or protected paths (INF-004).

## 6. Seed contract (fixture for humans and tests)

Created by `DemoSeed` (back end) and mirrored by the fake backend's `src/shared/api/mock/data.ts` (front end). Password for every user: `Kingspan@123`.

| Fixture | Value (fictional) |
|---|---|
| Cost centers | `CC-TI-01` (Tecnologia da Informação), `CC-ADM-02` (Administrativo) |
| Budgets (current month) | `CC-TI-01`: R$ 50.000,00, consumed R$ 49.200,00 by a seeded APPROVED request (R$ 800,00 left); `CC-ADM-02`: R$ 80.000,00, consumed R$ 12.000,00 by an APPROVED request (A-33) |
| Users | `solic.ti@`, `aprov1.ti@` (N1), `aprov2.ti@` (N2), `solic.adm@`, `aprov1.adm@`, `aprov2.adm@`, `admin1@`, `admin2@` — all `@kingspan.test` |
| Requests (10) | DRAFT; pending at N1 (R$ 900 — approving it demonstrates `BUDGET_EXCEEDED`); pending at N2; CHANGES_REQUESTED (v1 returned, working copy already edited); APPROVED R$ 49.200; REJECTED; pending at ADMIN — "Notebooks para o time de TI", R$ 24.499,50 in `CC-ADM-02` (the video flow); APPROVED R$ 12.000; CANCELLED draft; SOFTWARE R$ 3.000 pending at N1 (chain N1 → N2 → ADMIN) |
| Idempotency | the seed stores no keys |

## 7. OpenAPI ↔ implementation

- `docs/api/openapi.yaml` is the contract master; springdoc serves the generated spec at `/v3/api-docs`
  (Swagger UI at `/docs`).
- Not yet automated: a contract test comparing the generated spec with `openapi.yaml` (planned in SPEC-019).
- Money pattern, error schema, pagination envelope and `allowedActions` semantics are normative for both
  the real API and the fake backend.
