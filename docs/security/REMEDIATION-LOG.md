# Remediation Log

Each entry: finding → root cause → change → regression tests → validation → limits.

"Unverified" means the code and tests exist but were not executed, because the audit environment has no JDK or Docker (see [SECURITY-SCOPE.md](SECURITY-SCOPE.md)). Run `./mvnw verify` in `backend/` to verify them; CI does this in `security.yml` → `backend`.

| Finding | Root cause | Files modified | Fix | Regression tests | Validation | Remaining limits |
|---|---|---|---|---|---|---|
| SEC-F01 | No attempt counter on login | `security/LoginAttemptLimiter.java` (new), `application/AuthService.java`, `api/AdminController.java`, `api/GlobalExceptionHandler.java`, `config/AppProperties.java`, `domain/ErrorCode.java`, `application.yml`, `.env.example`, `docs/api/openapi.yaml`, `docs/api/ERROR-CATALOG.md` | Fixed window per account (5) and per client (50) per 15 min → 429 + `Retry-After` | `LoginAttemptLimiterTest` (6), `SecurityIntegrationTest` (2) | ◐ unverified | In-memory, single instance; lockout DoS of a known e-mail (R-07, F21) |
| SEC-F02 | Query parameter passed to `navigate()`; React Router 6 backslash advisory | `frontend/src/shared/auth/safeReturnUrl.ts` (new), `features/auth/LoginPage.tsx` | Accept only same-origin app paths | `cypress/e2e/09-security.cy.ts` (8) | ✔ **8/8 passed**; full suite 54/54 | Upgrade React Router (R-10) |
| SEC-F03 | No body limit for JSON | `api/RequestSizeLimitFilter.java` (new), `security/ProblemResponses.java`, `api/GlobalExceptionHandler.java`, `AppProperties`, `ErrorCode`, `application.yml` | 413 on declared size; counting stream for chunked bodies | `RequestSizeLimitFilterTest` (4) | ◐ unverified | — |
| SEC-F04 | `VITE_MOCK_BACKEND !== 'false'` defaulted to on in every build; demo picker unconditional; runtime flag not dead-code-eliminated | `frontend/vite.config.ts`, `src/shared/config.ts` (new), `src/vite-env.d.ts`, `src/shared/api/client.ts`, `src/App.tsx`, `features/auth/LoginPage.tsx`, `frontend/README.md`, `.env.example` | Compile-time `define` flags, on for the dev server and off for production; mock loaded through dynamic `import()` | Bundle inspection (production: 0 password, 0 seed e-mails, no mock); Cypress 54/54 in dev mode | ✔ verified | A demo deployment against a seeded backend must opt in with `VITE_DEMO_LOGIN=true` |
| SEC-F05 | `@Size` counts characters; bcrypt limit is 72 bytes | `application/PasswordRules.java` (new), `AuthService`, `UserAdminService`, `api/dto/AdminDtos.java` | 400 on more than 72 bytes; login never hashes over-long input; upper bounds on `LoginInput` | `InputHardeningTest` (1), `SecurityIntegrationTest` (1) | ◐ unverified | — |
| SEC-F06 | Case-sensitive unique index | `db/migration/V7__security_hardening.sql` (new) | `UNIQUE (lower(email))` | `SecurityIntegrationTest.emailUniquenessIsCaseInsensitiveInTheDatabase` | ◐ unverified | V7 fails if an existing database already has case-duplicates; deduplicate first |
| SEC-F07 | No guard on `approval_steps` | `V7__security_hardening.sql` | Trigger: decided steps immutable, identity immutable, no deletes | `SecurityIntegrationTest.decidedApprovalStepsCannotBeRewrittenOrDeleted` | ◐ unverified | An owner-role session can still drop the trigger (F17) |
| SEC-F08 | No `aud`; default validator tolerates missing `exp` | `security/JwtService.java`, `security/SecurityConfig.java`, `AppProperties`, `application.yml`, `.env.example` | Issue and require `aud`; require `exp` | `JwtValidationTest` (10), `SecurityIntegrationTest` (1) | ◐ unverified | Tokens issued before deploy (≤ 15 min old) are rejected once |
| SEC-F09 | Raw user text used as a LIKE pattern | `application/RequestSpecifications.java`, `application/UserAdminService.java` | Escape `\ % _`, `ESCAPE '\'`, max 100 characters | `InputHardeningTest` (2), `SecurityIntegrationTest` (1) | ◐ unverified | — |
| SEC-F10 | Catch-all treated framework 4xx as 500 | `api/GlobalExceptionHandler.java` | Keep the `ErrorResponse` 4xx status; no error log | — (covered by review; an HTTP-level test is in the backlog, T-API-01) | ◐ unverified | — |
| SEC-F11 | Password in log line | `config/DemoSeed.java`, `application.yml` comment, `.env.example`, `backend/README.md` | WARN without credential; documented opt-out | — | ◐ unverified (log text) | Seed stays on by default (R-03) |
| SEC-F12 | Policy only on sign-up | `api/dto/AdminDtos.java` | Shared `PASSWORD_PATTERN`; e-mail ≤ 254 | `SecurityIntegrationTest` (indirect) | ◐ unverified | — |
| SEC-F13 | 49-byte placeholder passes the length check | `.env.example`, `security/SecurityConfig.java` | Empty example; refuse known placeholders | `JwtValidationTest` (2) | ◐ unverified (example file ✔ by inspection) | Other weak secrets ≥ 32 bytes are not detectable |
| SEC-F25 | Docs always on | `application.yml`, `.env.example` | `API_DOCS_ENABLED` toggle (default `true`, README §3.1) | — | ◐ unverified | — |
| SEC-F26 | No CI security checks | `.github/workflows/security.yml` (new), `docs/security/SECURITY-PIPELINE.md` | npm audit, dependency review, gitleaks, CodeQL, backend tests + Dependency-Check, hadolint | — | ◐ not yet run (YAML parses; 6 jobs) | Needs `NVD_API_KEY`; branch protection to make CodeQL blocking |

**Compatibility implications:**
- **API:** two new error responses (`413 PAYLOAD_TOO_LARGE`, `429 TOO_MANY_REQUESTS`). New 400s for passwords over 72 bytes, e-mails over 254 characters, search terms over 100 characters, and admin-created passwords without a letter and a digit. All documented in `openapi.yaml` and `ERROR-CATALOG.md`.
- **Tokens:** they now carry `aud`. Older tokens are rejected (at most 15 minutes after deploy).
- **Configuration:** new optional variables (`JWT_AUDIENCE`, `LOGIN_*`, `MAX_REQUEST_BODY`, `API_DOCS_ENABLED`, `VITE_DEMO_LOGIN`). `JWT_SECRET` must now be set explicitly when starting from `.env.example`.
- **Front end:** `npm run build` now targets the real API by default. Set `VITE_MOCK_BACKEND=true` to ship the demo mock deliberately.
- **Database:** additive migration V7, with no data changes.

No business rule was changed. All pre-existing tests were left untouched.
