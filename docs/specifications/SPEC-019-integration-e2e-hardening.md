# SPEC-019 — Integration, E2E & Hardening

## 1. Specification Metadata
- **ID:** SPEC-019 · **Feature:** Cross-module integration, contract verification, full pipeline · **Version:** 1.0
- **Priority:** P0 · **Complexity:** L (6–9 h) · **Dependencies:** all backend specs (001–014), front-end (015–017) · **Wave:** 5–6
- **Responsible agent:** AGENT-SPEC-019 · **Status:** partial — back-end integration and concurrency tests written (not yet executed); Cypress E2E suite green (8 specs, 46 tests); **compose, CI, OpenAPI contract test, smoke script and `SOLUTION.md` missing**

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
The README §5.2 mandatory test scenarios live here as executable proof: full 3-step flow with
consumption, segregation, BUDGET_EXCEEDED, version preservation, idempotency — plus the concurrency
suite (§5.2) and contract verification (OpenAPI sync, allowedActions ⇔ inbox consistency, error catalog).

## 3. Scope
**In:** integration suite on Testcontainers (IT-01..IT-09), concurrency suite (CT-01..CT-06), OpenAPI
contract test, full-pipeline smoke (`docker compose up --build` + seeded login via script), CI hardening
(coverage gates optional), README/SOLUTION cross-checks (SUB-003/006 content present).
**Out:** product code changes (fix-forward only with notes). E2E was implemented with Cypress (not Playwright) in the front end.

## 4. Requirements
NFR-013 · NFR-014 · NFR-015 · NFR-016 · NFR-017 · QA-001..QA-008 · SUB-001..SUB-010 (verification side) · INF-004

## 5. Business Rules
- Concurrency assertions are exact (one winner / exact balances), never "eventually consistent" hand-waving.
- Contract test fails CI if served OpenAPI diverges from `docs/api/openapi.yaml` semantics.

## 6. Architecture (as implemented)
- Back end: `IntegrationTest` base (`@SpringBootTest` + Testcontainers, `TRUNCATE` per test), `WorkflowIntegrationTest`, `ConcurrencyIntegrationTest` (start-gated threads, sealed `Attempt<T>`).
- Front end: `frontend/cypress/e2e/01`–`08` (one spec per screen), `cypress/e2e-runner.mjs` (Vite + Cypress in one process; non-zero exit on failure or zero tests), `cypress/run.mjs` (clears `ELECTRON_RUN_AS_NODE`).
- Missing: OpenAPI sync test, `scripts/smoke.sh`, compose boot, CI workflow, `SOLUTION.md`.

## 7. API Contract
No new endpoints; asserts all existing ones against `openapi.yaml`.

## 8. Database Impact
Uses real migrations + seed; asserts DB-level invariants (never-negative, append-only).

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Integration: 3-step flow → APPROVED + consumed | IT-01 | NFR-014 |
| T02 Segregation scenarios (self, duplicate) | IT-02 | NFR-014 |
| T03 BUDGET_EXCEEDED + failure event | IT-03/04 | NFR-014 |
| T04 Version preservation on resubmit | IT-05 | NFR-014 |
| T05 Idempotency create suite | IT-09, CT-05 | NFR-014/022 |
| T06 Concurrency: same-step race, budget race, lock races | CT-01/02/04 | NFR-015 |
| T07 Audit append-only + UTC checks | IT-06, IT-07 | FR-026/NFR-005 |
| T08 Contract tests (OpenAPI sync, allowedActions⇔inbox, error catalog) | suite | QA-008 |
| T09 Compose smoke script + CI wiring | green pipeline | NFR-009/011 |
| T10 Delivery checklist verification (protected files, trailers, READMEs) | report | SUB/INF-004 |

## 10. Testing Strategy
This spec **is** the testing strategy executor; matrices in `docs/testing/TEST-MATRIX.md` map 1:1 to its suites.

## 11. Acceptance Criteria
- **G**iven the full suite **W**hen `./mvnw test` runs in `backend/` **T**hen unit, integration and concurrency suites are green in one command (NFR-017); `npm run test:e2e` does the same for the front end.
- **G**iven 100 concurrent final approvals on one R$10.000 budget (requests of R$7.000+R$7.000) **W**hen assertions run **T**then consumed ≤ amount in every trial and losers got 422.
- **G**iven the final commit **W**hen CI runs **T**then backend+frontend jobs are green.

## 12. Integration Requirements
Owns cross-spec consistency; may request fixes in any module but must not rewrite shared contracts (SHARED-CONTRACTS.md).

## 13. Risks
Flaky concurrency tests on slow CI — bound parallelism, use generous (but exact) assertions; mark deterministic seeds.

## 14. Definition of Done
All IT/CT/contract suites green; compose smoke passes; delivery checklist signed off; AI-logged.
