# ADR-014 — Testing Architecture: Pure Unit Tests, Real PostgreSQL, Real Threads, Browser E2E

**Status:** Accepted · revised 2026-11-18 to match the current implementation
**Date:** 2026-11-15

## Context
README §5.2 mandates: unit tests of the state machine and chain builder covering **all** transitions,
including invalid ones; integration tests on a **real database** for five scenarios; **automated
concurrency tests** for the two race hazards; ≥ 3 significant front-end tests; one test command per side.

## Problem
Design a test architecture that proves the graded invariants (state machine, budget, races) without flakiness.

## Options Considered
1. Mocked repositories + in-memory database (H2) for integration.
2. **Pure unit tests for the domain; Testcontainers PostgreSQL for integration and concurrency; Cypress in the browser for the UI.**
3. End-to-end tests only.

## Decision
Option 2.

**Back end** (`./mvnw verify`, which also runs Checkstyle) — 18 test classes, 119 test methods (more runs
with the parameterized and repeated ones):
- *Unit* (`src/test/java/.../domain`, no Spring): parameterized JUnit 5 + AssertJ — every status × action
  pair of README §4.2, the chain at the exact cent boundaries (R$ 1.000,00 / 1.000,01 / 10.000,00 / 10.000,01),
  eligibility matrix, segregation, comment rule, visibility and `allowedActions`, money and the São Paulo calendar.
- *Integration* (`IntegrationTest` base, `@SpringBootTest` + Testcontainers `postgres:16-alpine` and
  `redis:7-alpine` via `@ServiceConnection`): the README §5.2 scenarios against the real schema — triggers,
  CHECKs and row locks only exist there (`WorkflowIntegrationTest`, `RequestRulesIntegrationTest`,
  `InboxAndDashboardIntegrationTest`, `AdminServicesIntegrationTest`, `DemoSeedIntegrationTest`,
  `SecurityIntegrationTest`). They call the application services with an `Actor`, as the controllers do;
  each test starts from a `TRUNCATE` of all tables.
- *HTTP contract* (`HttpContractIntegrationTest`, full server): status codes, `problem+json` with `code` and
  `requestId`, field errors, `X-Request-Id` on every response and on the history event, logout and Redis
  sessions, sign-up validation.
- *Security units*: `JwtValidationTest`, `LoginAttemptLimiterTest`, `RequestSizeLimitFilterTest`, `InputHardeningTest`.
- *Concurrency* (`ConcurrencyIntegrationTest`): real threads (`ExecutorService` + `CountDownLatch` start
  gate), real transactions, the two same-step races repeated 5×; assertions accept any winner, never an overdraw.
- Without Docker the integration/concurrency classes are **skipped** (`@Testcontainers(disabledWithoutDocker = true)`), not failed.

**Front end**: Cypress in two suites.
- `npm run test:e2e` — fake backend, 10 specs and 108 tests: one spec per screen, `09-security` and the
  checklist (`10-checklist`). `cypress/e2e-runner.mjs` starts Vite and Cypress in one process, saves the raw
  results and exits non-zero on any failure or when zero tests ran.
- `npm run test:e2e:api` — the real compose stack (gateway → Spring → PostgreSQL + Redis), 4 specs and 59 tests,
  run by the CI compose job. The checklist spec writes only in a sandbox cost center it creates and reuses one
  token per user (the gateway limits logins), so it also passes on a database that is not fresh; specs
  `01`–`03` expect a fresh seed.
- **Checklist bridge:** `cypress/shared/checklist.ts` holds one test per item of the manual catalog
  (`driven-tests/`), titled with the item id; `npm run checklist[:api]` turns the results into a session file
  for the checklist page and a Markdown report (CI artifacts `checklist-mock` and `checklist-api`).

**Manual walkthrough**: `driven-tests/index.html`, 84 items done on screen in the order the app is used;
CI checks the catalog (`check-plan.mjs`).

## Rationale
H2 would not run the PostgreSQL triggers, `ON CONFLICT`, row locks or CHECK constraints this challenge
grades. Start-gated threads make the race tests deterministic in outcome. Browser tests prove the
`allowedActions`, 409 and 422 UX exactly as a user sees it.

## Consequences
- CI runs every suite on each push: back-end tests, the fake-backend E2E, and `docker compose up` with a
  smoke test plus the real-API E2E.
- HTTP-level tests exist for the contract and security paths (`HttpContractIntegrationTest`); most flow tests
  still call the services directly.
- **Version drift:** Testcontainers uses `postgres:16-alpine`, compose runs PostgreSQL 17 (to align).
- No front-end component tests (Vitest/RTL) — the Cypress suite currently stands in for the README's
  "≥ 3 significant front-end tests"; whether E2E tests satisfy that wording is the evaluators' call.
- Most E2E tests still run against the fake backend; the real-API suite covers the main flows and the whole
  checklist, but not every screen (administration only against the fake backend).

## Trade-offs
Testcontainers adds container start-up time per test run; the fake-backend Cypress suite takes about
6 minutes, the real-API suite a few more on top of the compose start.

## Related
`testing/TEST-STRATEGY.md`, `testing/TEST-MATRIX.md`, `testing/CONCURRENCY-TESTS.md`.
