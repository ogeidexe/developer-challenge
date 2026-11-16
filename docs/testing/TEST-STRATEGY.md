# Test Strategy

> Goal: prove the business rules the README grades (§7: domain/state machine 25%, consistency 15%,
> tests 15%) with fast, deterministic suites. Mapping of planned test IDs to real tests: `TEST-MATRIX.md`.

## 1. Current state (2026-11-15)

| Suite | Tooling | Where | State |
|---|---|---|---|
| Back-end unit | JUnit 5 + AssertJ, no Spring | `backend/src/test/java/com/example/purchase/domain` (5 classes) | written, **not yet executed** |
| Back-end integration | `@SpringBootTest` + Testcontainers `postgres:16-alpine` | `WorkflowIntegrationTest` (10 tests) | written, **not yet executed** |
| Back-end concurrency | same + `ExecutorService` / `CountDownLatch` | `ConcurrencyIntegrationTest` (3 tests, two repeated 5×) | written, **not yet executed** |
| Back-end HTTP/API | — | — | **missing** (status codes, `problem+json`, `X-Request-Id` through MockMvc or HTTP) |
| Front-end end-to-end | Cypress 13 against the in-browser fake backend | `frontend/cypress/e2e` (8 specs, 46 tests) | **green** |
| Front-end component | — | — | **missing** (no Vitest/RTL) |
| Contract (OpenAPI sync, inbox ⇔ allowedActions) | — | — | **missing** |

"Not yet executed": the authoring environment had no JDK or Docker. First step for anyone with them:
`cd backend && ./mvnw verify`.

## 2. Test pyramid as built

| Layer | Scope | Command |
|---|---|---|
| Unit | every status × action pair of README §4.2; chain at the cent boundaries; eligibility matrix; segregation (incl. reset per version); comment rule; visibility and `allowedActions`; `Money`; São Paulo competence month and "today" | `./mvnw test` |
| Integration | README §5.2: 3-step flow to APPROVED with consumption; self-approval and duplicate approver; `BUDGET_EXCEEDED` (full rollback + audit); month without budget; return → edit → resubmit = v2 with v1 preserved; idempotent create; plus reject closes the chain, stale lock = 409, drafts invisible to ADMIN, DB-level immutability | `./mvnw test` (Docker) |
| Concurrency | same step twice → one 200 + one 409; same **final** step with R$ 800 left → 409, never 422, no false audit row; five R$ 3.000 finals on R$ 10.000 → exactly three approved | `./mvnw test` (Docker) |
| End-to-end (UI) | one spec per screen: login/401, dashboard scopes, list URL state, form, detail workflow (video flow, 409, 422, v2), inbox, admin, navigation/404 | `npm run test:e2e` |

## 3. Rules

1. **Determinism.** The domain takes an injected `Clock` (`BusinessCalendar`); concurrency tests use a
   start gate (`CountDownLatch`), never sleeps, and accept any winner while asserting the invariant.
2. **One command per side** (NFR-017): `./mvnw test` (back end), `npm run test:e2e` (front end).
3. **Real database for integration** (NFR-014): Testcontainers PostgreSQL 16 — triggers, CHECKs,
   `ON CONFLICT` and row locks are part of the product. Without Docker these classes are **skipped**
   (`@Testcontainers(disabledWithoutDocker = true)`), so the unit suite still runs.
4. **Messages are asserted** (QA-008) where they carry values: e.g. `BUDGET_EXCEEDED` mentions available
   and required amounts; `DUPLICATE_APPROVER` names the step already approved.
5. **Isolation.** Integration tests `TRUNCATE` every table before each test (row triggers do not fire on
   `TRUNCATE`); Cypress clears `localStorage`/`sessionStorage` between tests, so each starts from the seed.

## 4. Environment & data

- Integration tests build their own fixtures (one cost center, requester, N1, N2, two admins) through the
  repositories and services; the demo seed is disabled (`app.seed.enabled=false`).
- Cypress runs against the fake backend's seed (`frontend/src/shared/api/mock/data.ts`), which mirrors `DemoSeed`.
- The 409 E2E test acts as a second user through `window.__mockBackend`, exposed only inside Cypress.

## 5. Coverage

No coverage tooling is configured yet (JaCoCo would be the back-end choice). Target once it runs: domain ≥ 90 % lines.

## 6. CI

Not written yet. Target: back-end job `./mvnw verify` (ubuntu runners have Docker for Testcontainers);
front-end job `npm ci && npm run build && npm run test:e2e`. Both green on the final commit (NFR-011).

## 7. Manual verification (pre-video checklist)

README §8.1 flow against the seed: the R$ 24.499,50 request in `CC-ADM-02` through to the ADMIN approval
with consumption; "Antivírus corporativo" returned → edited → resubmitted (v2); refusals: self-approval,
duplicate approver, `BUDGET_EXCEEDED` ("Kit periféricos" in `CC-TI-01`), stale lock 409 (two tabs).
The Cypress spec `05-request-detail` automates this flow against the fake backend.
