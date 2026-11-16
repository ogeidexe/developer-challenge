# Security Test Results — 2026-11-15

## Executed (front end)

| Check | Command | Result |
|---|---|---|
| Typecheck app | `npx tsc --noEmit` | ✔ pass |
| Typecheck Cypress | `npm run typecheck:e2e` | ✔ pass |
| E2E security spec (SEC-F02) | `npx cypress run --e2e --spec cypress/e2e/09-security.cy.ts` | ✔ **8/8** |
| Full E2E regression (after all front-end fixes) | `npx cypress run --e2e` | ✔ **54/54** (9 specs) |
| Production bundle, default flags (SEC-F04) | `vite build` + grep | ✔ demo password **0**, seed e-mails **0**, mock rules **0**, `__mockBackend` **0**; one JS chunk only |
| Production bundle before the fix | same | ✖ demo password **2** hits, seed and mock bundled (evidence for SEC-F04) |
| Forced mock build | `VITE_MOCK_BACKEND=true vite build` | ✔ mock chunk present, as intended |
| npm audit | `npm audit --json` | 9 advisories (6 moderate, 3 high), **all dev-only** except `react-router` (moderate, mitigated); see DEPENDENCY-AUDIT |
| `npm audit fix` (non-breaking) | `npm audit fix --ignore-scripts` | no change possible within semver ranges |
| Secret scan, working tree | pattern scan (keys, tokens, JWTs, generic assignments) | ✔ no real secret; 15 files with expected matches triaged in SECRETS-AUDIT |
| Secret scan, git history | `git log --all -p` + patterns | ✔ 0 matches |
| OpenAPI after contract changes | YAML parse | ✔ 25 operations; `/auth/login` documents 413/429 |
| Workflow syntax | YAML parse | ✔ 6 jobs |

**Run note:** the E2E runs used the Vite dev server that was already listening on 127.0.0.1:5174, started from this repository's `frontend/`. Vite reloads changed sources and restarts when `vite.config.ts` changes. The served `src/shared/config.ts` was checked to contain the new compile-time flags before the final run.

## Written, not executed (back end)

**Reason:** no JDK and no Docker in the audit environment; installing a JDK was not permitted. Status: **fixed but unverified.**

| Test class | Tests | Covers |
|---|---|---|
| `security/JwtValidationTest` | 10 | AUTH-02…07, AUTH-11 |
| `security/LoginAttemptLimiterTest` | 6 | AUTH-10 |
| `api/RequestSizeLimitFilterTest` | 4 | IV-02 |
| `application/InputHardeningTest` | 3 | IV-03, AUTH-12 |
| `SecurityIntegrationTest` (Testcontainers) | 14 | AUTH-01/10/12/13, AZ-01…04/06, IV-01/03, BL-05/09/10 |

The pre-existing `WorkflowIntegrationTest` (10) and `ConcurrencyIntegrationTest` (3) cover BL-01…08 and were not modified. They also have not been executed yet.

**Expected first-run risks:** these tests target Spring Boot 4.1 / Spring Security 7 / Jackson 3 APIs that could not be compiled here. A compile error must be fixed in the test or the code, never by weakening the assertion.

## Not run

| Item | Why | Mitigation |
|---|---|---|
| DAST (OWASP ZAP) | back end cannot be started | Procedure in SECURITY-TEST-PLAN |
| Semgrep | not installed | CodeQL `security-extended` in CI |
| Back-end SCA | Maven unavailable | Dependency-Check + dependency review in CI |
| HTTP-level API tests (T-API-01…05) | need a running app | backlog; recommended with MockMvc once the build runs |
