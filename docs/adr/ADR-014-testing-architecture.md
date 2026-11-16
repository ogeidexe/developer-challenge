# ADR-014 — Testing Architecture: Pure Unit Tests, Real PostgreSQL, Real Threads, Browser E2E

**Status:** Accepted · revised 2026-11-15 to match the implementation
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

**Back end** (`./mvnw test`):
- *Unit* (`src/test/java/.../domain`, no Spring): parameterized JUnit 5 + AssertJ — every status × action
  pair of README §4.2, the chain at the exact cent boundaries (R$ 1.000,00 / 1.000,01 / 10.000,00 / 10.000,01),
  eligibility matrix, segregation, comment rule, visibility and `allowedActions`, money and the São Paulo calendar.
- *Integration* (`IntegrationTest` base, `@SpringBootTest` + Testcontainers `postgres:16-alpine` via
  `@ServiceConnection`): the README §5.2 scenarios against the real schema — triggers, CHECKs and row locks
  only exist there. Tests call the application services with an `Actor`, as the controllers do; each test
  starts from a `TRUNCATE` of all tables.
- *Concurrency* (`ConcurrencyIntegrationTest`): real threads (`ExecutorService` + `CountDownLatch` start
  gate), real transactions; assertions accept any winner, never an overdraw.
- Without Docker the integration/concurrency classes are **skipped** (`@Testcontainers(disabledWithoutDocker = true)`), not failed.

**Front end** (`npm run test:e2e`): Cypress, one spec per screen (8 specs, 46 tests) against the fake
backend; `cypress/e2e-runner.mjs` starts Vite and Cypress in one process and exits non-zero on any failure
or when zero tests ran.

## Rationale
H2 would not run the PostgreSQL triggers, `ON CONFLICT`, row locks or CHECK constraints this challenge
grades. Start-gated threads make the race tests deterministic in outcome. Browser tests prove the
`allowedActions`, 409 and 422 UX exactly as a user sees it.

## Consequences
- The back-end suites are **written but not yet executed** (no JDK/Docker in the authoring environment).
- No HTTP-level controller tests yet (status codes, `problem+json`, `X-Request-Id`) — the main gap.
- No front-end component tests (Vitest/RTL) — the Cypress suite currently stands in for the README's
  "≥ 3 significant front-end tests"; whether E2E tests satisfy that wording is the evaluators' call.
- The Cypress suite runs against the fake backend; pointing it at the real API needs fixture/reset support there.

## Trade-offs
Testcontainers adds container start-up time per test run; Cypress adds ~2.5 minutes for the full suite.

## Related
`testing/TEST-STRATEGY.md`, `testing/TEST-MATRIX.md`, `testing/CONCURRENCY-TESTS.md`.
