# Security Findings

Audit date: 2026-11-15 · Scope: [SECURITY-SCOPE.md](SECURITY-SCOPE.md) · Fixes: [REMEDIATION-LOG.md](REMEDIATION-LOG.md)

**Classification** (per the audit brief):
- **C1**: confirmed exploitable vulnerability.
- **C2**: confirmed security weakness (real, but needs a precondition such as misconfiguration, or has limited impact).
- **C3**: potential vulnerability that needs more validation.
- **FP**: false positive (checked, not a problem).

**Status values:**
- **Fixed ✔ verified**: a test that exercises the fix was run and passed.
- **Fixed ◐ unverified**: code and tests are written but could not be run. No JDK or Docker is available in the audit environment, so this applies to every backend fix.
- **Accepted**: documented in the [RISK-REGISTER](RISK-REGISTER.md).
- **Open**: still needs work.

**CVSS:** CVSS 4.0 base vectors are given where the impact is well understood. Numeric scores are **not** stated: they were not computed with the official FIRST calculator, and a hand-computed number would be invented. Severity is a qualitative rating based on each vector and the business impact.

## Summary

| ID | Title | Sev. | Class | Status |
|---|---|---|---|---|
| SEC-F01 | No brute-force protection on `POST /auth/login` | Medium | C2 | Fixed ◐ |
| SEC-F02 | Open redirect through `returnUrl` on the login page | Medium | C2 | Fixed ✔ |
| SEC-F03 | Unbounded request body size (unauthenticated memory DoS) | Medium | C2 | Fixed ◐ |
| SEC-F04 | Production front-end build defaulted to the in-browser fake backend and advertised admin credentials | Medium | C1 | Fixed ✔ |
| SEC-F05 | bcrypt 72-byte limit not enforced (500 / silent truncation) | Low | C2 | Fixed ◐ |
| SEC-F06 | E-mail uniqueness case-sensitive in the database | Low | C2 | Fixed ◐ |
| SEC-F07 | Decided approval steps can be rewritten or deleted at the database level | Low | C2 | Fixed ◐ |
| SEC-F08 | JWT audience neither issued nor validated; `exp` not required | Low | C2 | Fixed ◐ |
| SEC-F09 | LIKE wildcards in search terms not escaped; search length unbounded | Low | C2 | Fixed ◐ |
| SEC-F10 | Framework 4xx errors answered as 500 with error-level stack traces | Low | C2 | Fixed ◐ |
| SEC-F11 | Demo seed: on by default, one public password, password written to logs | Low | C2 | Partly fixed ◐ / Accepted |
| SEC-F12 | Admin-created users skip the password policy; e-mail length unbounded | Low | C2 | Fixed ◐ |
| SEC-F13 | `.env.example` JWT secret placeholder passes the start-up check | Medium | C2 | Fixed ◐ |
| SEC-F14 | Any authenticated user can read any cost center's budget | Low | C2 | Accepted (README contract) |
| SEC-F15 | Public sign-up reveals registered e-mails (409) and is not throttled | Low | C2 | Accepted |
| SEC-F16 | Access token in `sessionStorage`; no CSP / security headers for the SPA host | Low | C3 | Open |
| SEC-F17 | Application connects to PostgreSQL as the schema owner | Low | C2 | Open |
| SEC-F18 | Front-end dev-tool dependency advisories (Vite, esbuild, Cypress chain) | Medium (dev machines) | C2 | Accepted until 2027-02-15 |
| SEC-F19 | React Router 6 advisories (open redirect via backslash; SSR deserialization) | Low | C2 | Mitigated by SEC-F02 |
| SEC-F20 | Back-end dependencies not scanned during the audit | Info | C3 | Open (CI job added) |
| SEC-F21 | Login throttling is in-memory, single instance, keyed by TCP peer | Info | — | Accepted (design limit) |
| SEC-F22 | No TLS in the app; base images pinned by tag, not digest; no compose yet | Info | — | Open |
| SEC-F23 | Database password falls back to `purchase` when `DB_PASSWORD` is unset | Low | C2 | Accepted (local dev) |
| SEC-F24 | `/health` is public and lists component names | Info | — | Accepted (README §3.1) |
| SEC-F25 | Swagger UI / OpenAPI JSON public | Info | — | Mitigated (`API_DOCS_ENABLED`) |
| SEC-F26 | No security checks in CI | Info | — | Fixed ◐ (workflow added, not yet run) |
| SEC-F27 | No token revocation or refresh tokens | Info | — | Accepted (15-min TTL + per-request DB re-load) |

**Totals:**
- By severity: 0 Critical, 0 High, 6 Medium, 14 Low, 7 Informational (27 total).
- Remediated: 12 (2 verified, 10 unverified), plus SEC-F11 partly fixed, SEC-F26 added but not yet run, and SEC-F25 mitigated by a toggle.
- **No critical or high finding was confirmed.** False positives and checked-safe controls are listed at the end.

---

## SEC-F01 — No brute-force protection on `POST /auth/login`

- **Component:**
  - before: `backend/.../application/AuthService.java` (`login`), `api/AdminController.java` (`/auth/login`);
  - fixed in: `security/LoginAttemptLimiter.java`, `AuthService.java:61`.
- **CWE:** CWE-307 Improper Restriction of Excessive Authentication Attempts.
- **OWASP:** A07:2021 Identification and Authentication Failures; API2:2023 Broken Authentication.
- **CVSS 4.0:** `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N` (AT:P: the target password must be guessable).
- **Evidence:**
  - `login` compared the password and threw `BadCredentialsException` with no counter of any kind.
  - The endpoint is public (`SecurityConfig`: `POST /auth/login` permitAll).
  - The password policy allows 8-character letter+digit passwords, so online guessing is practical.
  - The README lists "rate limit no login" as a differentiator.
- **Root cause:** the control was never implemented.
- **Business impact:** account takeover. An `APROVADOR` or `ADMIN` account allows approving purchases and consuming budget.
- **Fix:**
  - Fixed-window throttling per account (normalized e-mail, default 5 failures / 15 min) and per client address (default 50 / 15 min).
  - While a key is blocked, **every** attempt gets `429 TOO_MANY_REQUESTS` with `Retry-After`, including attempts with the right password; otherwise guessing could simply continue.
  - A successful login clears the account counter.
  - The limits are configurable (`LOGIN_*`).
- **Regression risk:** a legitimate user can be locked out for up to 15 minutes by someone who knows their e-mail. This is the accepted trade-off (RISK-REGISTER R-07).
- **Tests:** `LoginAttemptLimiterTest` (6), `SecurityIntegrationTest.repeatedWrongPasswordsLockTheAccountEvenForTheRightPassword`, `unknownEmailAndWrongPasswordFailIdentically`.

## SEC-F02 — Open redirect through `returnUrl` on the login page

- **Component:** `frontend/src/features/auth/LoginPage.tsx:39` (before: `params.get('returnUrl') ?? '/'` passed directly to `navigate()` and `<Navigate>`); fixed by `src/shared/auth/safeReturnUrl.ts`.
- **CWE:** CWE-601 URL Redirection to Untrusted Site.
- **OWASP:** A01:2021 Broken Access Control (unvalidated redirects).
- **CVSS 4.0:** `AV:N/AC:L/AT:N/PR:N/UI:A/VC:N/VI:N/VA:N/SC:L/SI:L/SA:N`.
- **Evidence:**
  - The query parameter is attacker-controlled.
  - The installed `react-router-dom@6.30.6` is affected by **GHSA-wrjc-x8rr-h8h6**: open redirect via a backslash in `useNavigate`/`<Link>`. There is no 6.x fix; the patch is in 7.18.
  - A link such as `/login?returnUrl=/\evil.example` sent to a victim would redirect after a real login. That makes it a phishing primitive on the trusted origin.
  - Classified C2: the advisory and the data flow confirm the sink. The pre-fix behaviour was not reproduced in a browser.
- **Fix:**
  - `safeReturnUrl()` accepts only same-origin, app-relative paths.
  - It rejects `//host`, backslashes, control characters (`/\t/host`), absolute and `javascript:` URLs, and `/login` loops. Rejected values fall back to `/`.
- **Tests:** `cypress/e2e/09-security.cy.ts`: 7 hostile values plus 1 legitimate deep link. **8/8 passed.**

## SEC-F03 — Unbounded request body size

- **Component:** before: no limit anywhere. Tomcat's `max-http-form-post-size` covers form posts only, and the JSON bodies were parsed in full before bean validation. Fixed by `api/RequestSizeLimitFilter.java:35` and `GlobalExceptionHandler.unreadable`.
- **CWE:** CWE-770 Allocation of Resources Without Limits.
- **OWASP:** API4:2023 Unrestricted Resource Consumption.
- **CVSS 4.0:** `AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:N/SI:N/SA:N`.
- **Evidence:**
  - `/auth/login` and `/auth/register` are unauthenticated.
  - A multi-hundred-megabyte JSON string is read into memory by Jackson. Jackson's default `StreamReadConstraints` limit a single string to 20 M characters but do not limit document size.
  - The largest legitimate body (50 items) is a few tens of KiB.
- **Fix:**
  - A servlet filter (before the security chain) refuses a declared `Content-Length` above `MAX_REQUEST_BODY` (default 1 MiB) with `413 PAYLOAD_TOO_LARGE`.
  - Chunked bodies are counted as they are read; crossing the limit aborts parsing, which also returns 413.
- **Tests:** `RequestSizeLimitFilterTest` (4).

## SEC-F04 — Production build defaulted to the fake backend and advertised admin credentials

- **Component:**
  - `frontend/src/shared/api/client.ts` (before: `USE_MOCK = VITE_MOCK_BACKEND !== 'false'`);
  - `features/auth/LoginPage.tsx` (demo picker, form pre-filled with `admin1@…` and the demo password);
  - `App.tsx` (reset-demo menu).
  - Fixed by `vite.config.ts` (`define`), `src/shared/config.ts`, `client.ts:11` (lazy `import()`), `LoginPage.tsx:74,97`.
- **CWE:** CWE-1188 Insecure Default Initialization of Resource; CWE-798 (credentials embedded in the client).
- **OWASP:** A05:2021 Security Misconfiguration.
- **CVSS 4.0:** `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N` (AT:P: needs the default seed on the target backend, SEC-F11).
- **Evidence (reproduced):**
  - `vite build` with no variables produced a bundle containing the fake backend, the entire seed and the demo password; `grep` found 2 password hits in the bundle.
  - With the default, a deployed SPA performed login and authorization **in the browser** against `localStorage`, so no server-side control applied.
  - With `VITE_MOCK_BACKEND=false`, the login screen still shipped the demo-user picker and pre-filled the **ADMIN** e-mail and password. Against a backend with the default seed (SEC-F11), anyone could sign in as `ADMIN`.
- **Fix:**
  - Both features are compile-time flags (`__USE_MOCK_BACKEND__`, `__SHOW_DEMO_LOGIN__`). They are **on for the dev server** (`npm run dev`, Cypress) and **off for production builds** unless explicitly set.
  - The fake backend is loaded with a dynamic `import()`, so when disabled it is dead code and removed from the bundle.
- **Verification:**
  - The new production bundle has **0** password hits, **0** seed e-mails, no fake-backend rules and no Cypress hook.
  - `VITE_MOCK_BACKEND=true` restores the mock as intended.
  - The full Cypress suite passes (**54/54**).

## SEC-F05 — bcrypt 72-byte limit not enforced

- **Component:** `AdminDtos` (`@Size(max = 72)` counts characters); fixed in `application/PasswordRules.java`, `AuthService.java:42,65`, `UserAdminService.create`.
- **CWE:** CWE-20 Improper Input Validation.
- **Evidence:**
  - bcrypt uses only the first 72 **bytes**. A 50-character password of accented letters (75 bytes) passes `@Size`.
  - Recent Spring Security `BCryptPasswordEncoder` throws for more than 72 bytes, which surfaces as a 500. Older versions silently truncated the password.
- **Fix:**
  - Sign-up and admin create return 400 on `password` when the password exceeds 72 UTF-8 bytes.
  - Login never hashes such a password; it compares a dummy value so the timing stays flat, then returns 401.
  - `LoginInput` gets upper bounds (e-mail ≤ 254, password ≤ 128).
- **Tests:** `InputHardeningTest.passwordsAreLimitedTo72BytesNot72Characters`, `SecurityIntegrationTest.passwordsLongerThanBcryptCanHashAreRejectedNotTruncatedOrA500`.

## SEC-F06 — E-mail uniqueness case-sensitive in the database

- **Component:** `V1__users_cost_centers.sql` (`UNIQUE (email)`); fixed by `V7__security_hardening.sql` (`UNIQUE (lower(email))`).
- **CWE:** CWE-178 Improper Handling of Case Sensitivity.
- **Evidence:**
  - The application checks `existsByEmailIgnoreCase`, but two concurrent sign-ups as `Ana@x` and `ana@x` both pass the check.
  - Afterwards `findByEmailIgnoreCase` returns two rows and that user's login fails with a 500: a targeted denial of service and account confusion.
- **Tests:** `SecurityIntegrationTest.emailUniquenessIsCaseInsensitiveInTheDatabase`.

## SEC-F07 — Decided approval steps mutable at the database level

- **Component:** `approval_steps` had no guard; `request_events`, `request_versions` and `version_items` already did (V5). Fixed by a V7 trigger (`trg_approval_steps_guard`).
- **CWE:** CWE-284 / CWE-693 (missing defense in depth for audit data).
- **Evidence:**
  - Who approved a step, when, and with which comment is part of the audit trail (README §2.5).
  - The application only updates `PENDING` steps (`UPDATE … WHERE status = 'PENDING'`), but any SQL session with the application's credentials could rewrite a decision silently.
- **Fix:** the trigger refuses any update of a non-`PENDING` step, any change of a step's identity (version, sequence, level), and any delete. `TRUNCATE`, used by the test reset, is not affected.
- **Tests:** `SecurityIntegrationTest.decidedApprovalStepsCannotBeRewrittenOrDeleted`.

## SEC-F08 — JWT audience neither issued nor validated; `exp` not required

- **Component:** `security/JwtService.java:41`, `security/SecurityConfig.java:110`.
- **CWE:** CWE-287 Improper Authentication (token-scope validation).
- **Evidence:**
  - Tokens carried no `aud`, and the decoder validated only `exp`/`nbf`/`iss`.
  - Spring's `JwtTimestampValidator` accepts a token **without** `exp`.
  - Impact needs a second system sharing the HS256 secret or issuer, or a signing bug, so the severity is Low.
- **Fix:**
  - `aud = JWT_AUDIENCE` (default `purchase-requests-api`) is issued, and the decoder requires it.
  - `exp` must be present.
  - HS256 stays pinned (no `none` or algorithm confusion).
  - Tokens issued before the upgrade (at most 15 minutes old) are rejected once.
- **Tests:** `JwtValidationTest` (10): valid; wrong issuer; wrong/missing audience; expired; no `exp`; tampered payload; other key; `alg: none`; short secret; placeholder secret. Also `SecurityIntegrationTest.issuedTokensCarryAudienceAndExpiryAndPassValidation`.

## SEC-F09 — LIKE wildcards in search terms not escaped; length unbounded

- **Component:** `RequestSpecifications.matching` (`q`), `UserAdminService.list` (`q`); fixed by `RequestSpecifications.containsPattern` (line 38) with an escape character.
- **CWE:** CWE-155 Improper Neutralization of Wildcards.
- **Evidence:**
  - The values were always bound as parameters, so this is **not** SQL injection.
  - `%` and `_` acted as patterns, so a search for `50%` matched `500`, and long patterns such as `%_%_%…` are expensive.
- **Fix:** wildcards are escaped, and terms longer than 100 characters return 400.
- **Tests:** `InputHardeningTest` (2), `SecurityIntegrationTest.searchWildcardsMatchLiterally`.

## SEC-F10 — Framework 4xx answered as 500 with error-level stack traces

- **Component:** `GlobalExceptionHandler.unexpected` (line 125).
- **CWE:** CWE-755 Improper Handling of Exceptional Conditions.
- **Evidence:**
  - `HttpMediaTypeNotSupportedException` (415), `HttpMediaTypeNotAcceptableException` (406) and other client errors without a dedicated handler fell through to the catch-all.
  - Any caller could produce a 500 response plus an ERROR log line with a stack trace at will. That pollutes logs, can trip alerting, and gives the client a misleading status.
- **Fix:** any `ErrorResponse` with a 4xx status keeps that status and returns a generic problem+json body, without an error log.

## SEC-F11 — Demo seed: on by default, one public password, password in logs

- **Component:** `application.yml:36` (`SEED_ENABLED:true`), `config/DemoSeed.java:70`.
- **CWE:** CWE-1392 Use of Default Credentials; CWE-532 Insertion of Sensitive Information into Log File.
- **Evidence:**
  - Eight accounts, including two `ADMIN`s, share a password that is in the source code and will be in `SOLUTION.md`.
  - The seed log line printed that password.
- **Fix:**
  - The password is no longer logged; a WARN line says that demo users exist and how to disable them.
  - `.env.example` and the back-end README document `SEED_ENABLED=false` for anything but a local demo.
  - The default stays `true` because README §5.3/§5.4 require a seeded `docker compose up` with no manual step (RISK-REGISTER R-03).

## SEC-F12 — Admin-created users skip the password policy; e-mail length unbounded

- **Component:** `AdminDtos.CreateUserInput`, `RegisterInput`.
- **CWE:** CWE-521 Weak Password Requirements.
- **Fix:**
  - The same letter+digit policy now applies to sign-up and admin create (`PASSWORD_PATTERN`, line 16).
  - E-mails are limited to 254 characters (RFC 5321); before, longer values reached the `varchar(255)` column and came back as a misleading 409.

## SEC-F13 — `.env.example` JWT secret placeholder passes the start-up check

- **Component:** `.env.example` (before: `JWT_SECRET=replace-with-a-random-secret-of-at-least-32-bytes`), `SecurityConfig.jwtSigningKey` (line 75).
- **CWE:** CWE-1188 Insecure Default Initialization; CWE-798 Use of Hard-coded Credentials.
- **CVSS 4.0:** `AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` (AT:P: the operator copied the example unchanged).
- **Evidence:**
  - The placeholder is 49 bytes, so the "at least 32 bytes" check accepted it.
  - A server started from `cp .env.example .env` would sign tokens with a key published in the repository, so anyone could mint an `ADMIN` token.
- **Fix:**
  - The example value is now empty, so the app refuses to start until a secret is generated.
  - `jwtSigningKey` refuses known placeholder values.
- **Tests:** `JwtValidationTest.refusesToStartWithTheDocumentedPlaceholderSecret`, `refusesToStartWithAShortSecret`.

## SEC-F14 — Any authenticated user can read any cost center's budget

- **Component:** `AdminController.getBudget` (lines 91–92: "any authenticated user").
- **CWE:** CWE-639 (horizontal read).
- **OWASP:** API1:2023 BOLA (read-only, financial metadata).
- **Assessment:**
  - README §3.1 defines `GET /cost-centers/:id/budgets/:yyyy-mm` with only the `PUT` restricted to `ADMIN`. The dashboard, however, scopes budgets to the user's own center (assumption A-12).
  - The inconsistency is real, but restricting the `GET` would change the published contract. **Accepted** (R-05); recommendation: ADMIN or members of that cost center only.

## SEC-F15 — Public sign-up reveals registered e-mails and is not throttled

- **Component:** `AuthService.register` (line 44, `409 EMAIL_ALREADY_REGISTERED`).
- **CWE:** CWE-204 Observable Response Discrepancy.
- **Assessment:**
  - Login does not leak whether an account exists (same message, dummy-hash timing), but sign-up must answer 409 by contract (ERROR-CATALOG).
  - Mass sign-up is not limited. A sign-up only ever creates a `SOLICITANTE`, which was verified by test.
  - **Accepted** (R-06); recommendation: per-address throttling of `/auth/register`, reusing `LoginAttemptLimiter`.

## SEC-F16 — Token in `sessionStorage`; no CSP for the SPA host

- **Component:** `frontend/src/shared/auth/AuthContext.tsx:53`.
- **CWE:** CWE-922 (token readable by script).
- **Assessment:**
  - No XSS sink was found: no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or URL-to-`href` flows, and React escapes all output.
  - The token is per-tab and expires after 15 minutes.
  - The repository has no production web server for the SPA yet, so no CSP or security headers are served. **Open**: when one is added, serve `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; object-src 'none'`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`.

## SEC-F17 — Application connects as the schema owner

- **Component:** `application.yml` (one datasource for Flyway and the runtime); `V5__events_immutability.sql:42-47` (REVOKE only if a `purchase_app` role exists).
- **CWE:** CWE-250 Execution with Unnecessary Privileges.
- **Assessment:**
  - The runtime user can run DDL and disable triggers; the immutability triggers only protect against application bugs and ordinary SQL.
  - **Open**: use a migration role (Flyway, via `spring.flyway.user`) and a separate `purchase_app` role with DML only. V5 already revokes UPDATE/DELETE on the audit tables from that role when it exists.

## SEC-F18 — Front-end dev-tool dependency advisories

See [DEPENDENCY-AUDIT.md](DEPENDENCY-AUDIT.md).
- **Affected:** `vite@5.4.21` (path traversal in optimized-deps `.map` handling; `launch-editor` NTLM hash disclosure and argument escaping on **Windows**), `esbuild` (dev server answers cross-origin requests), and the `cypress@13` chain (`extract-zip` symlink path traversal, `@cypress/request` → `qs`/`uuid`).
- **Exposure:** all are dev-only and none ships in the production bundle. The exposure is a developer machine running `npm run dev` while browsing a hostile page (the dev server binds to `localhost`).
- **Status:** `npm audit fix` (non-breaking) found nothing to change: `qs` is held back by `@cypress/request`'s version range. The fixes need major upgrades (Vite ≥ 6.4.x/7, Cypress ≥ 15), which carry regression risk for the E2E runner. **Accepted until 2027-02-15** (R-09).

## SEC-F19 — React Router 6 advisories

- **Advisories:** `react-router-dom@6.30.6` is affected by GHSA-wrjc-x8rr-h8h6 (open redirect via backslash) and GHSA-337j-9hxr-rhxg (constructor injection in **SSR** hydration).
- **Assessment:**
  - The open redirect is reachable only through `returnUrl`, which SEC-F02 sanitizes. All other `navigate()` calls use constant paths or server UUIDs.
  - The SSR issue does not apply: the app is client-rendered only.
  - Upgrade to React Router ≥ 7.18 is recommended (R-10).

## SEC-F20 — Back-end dependencies not scanned

- **Assessment:**
  - The audit environment has no JDK or Maven (and installing one was not permitted), so the Spring Boot 4.1.2 dependency tree could not be resolved or scanned.
  - The versions are recent and BOM-managed, but that is not evidence.
  - The CI job `backend` runs OWASP Dependency-Check (fails on CVSS ≥ 9) when an NVD API key is configured, and the `dependency-review` job blocks PRs that add high/critical advisories. **Open** until a first scan has run.

## SEC-F21 – SEC-F27 (informational)

- **F21:** `LoginAttemptLimiter` is per JVM and keyed by `request.getRemoteAddr()`.
  - Several instances would need a shared store.
  - Behind a reverse proxy, every client would share one address, so the per-client limit would apply to all users together. In that case, configure `server.forward-headers-strategy` for the **trusted** proxy only.
  - `X-Forwarded-For` is deliberately not read, because clients can spoof it.
- **F22:** TLS and HSTS are expected at the ingress (Spring Security adds HSTS on HTTPS requests by default). Docker base images use the `25-jdk`/`25-jre` tags rather than digests, and `docker-compose.yml` does not exist yet. The Dockerfile already runs as a non-root user (uid 10001) with a JRE-only runtime image.
- **F23:** `DB_PASSWORD` falls back to `purchase` (`application.yml:8`). This only works against a database created with that password, so it is acceptable for local development; production must set it.
- **F24:** `/health` is public by README §3.1. It lists component names and statuses, with `show-details` at its default (`never`), so no versions, hosts or credentials are exposed.
- **F25:** Swagger UI and the OpenAPI JSON are public by README §3.1. New: `API_DOCS_ENABLED=false` turns both off.
- **F26:** CI security pipeline added: `.github/workflows/security.yml`, see [SECURITY-PIPELINE.md](SECURITY-PIPELINE.md). It has not run yet.
- **F27:** Stateless 15-minute JWTs with no revocation list. Mitigation in place: `CurrentUser` re-loads the user from the database on every request, so deactivation and role changes take effect on the next request (README §6 lists refresh tokens as a differentiator).

---

## False positives and controls verified as safe

| Area | Checked | Result |
|---|---|---|
| SQL injection | Every query: Spring Data derived queries, JPQL with `@Param`, Criteria API, `JdbcClient` named parameters. Sorting goes through a whitelist (`RequestSpecifications.SORTABLE`) → 400 `INVALID_SORT` | **FP**: no string-built SQL |
| XSS | `grep` for `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, URL-driven `href`; antd renders text | **FP**: React escaping everywhere |
| Mass assignment | Input DTOs are records without `ownerId`, `status`, `total`, `role` (sign-up), `consumed`; unknown JSON properties are ignored | **FP**: test `theClientCannotChooseTheTotal` |
| IDOR / BOLA on requests | Every `/requests/{id}…` route goes through `RequestAccess.loadVisible` (404 for invisible, ADR-012) before any role or owner check | **FP**: tests `anotherRequesterCannot…`, `anApproverOfAnotherCostCenter…`, `draftsAreInvisibleEvenToAdmin` |
| Vertical escalation | `/users`, `POST /cost-centers`, `PUT …/budgets` → `RequestAccess.requireAdmin`; sign-up hard-codes `SOLICITANTE`; roles re-loaded from the database (token claims ignored) | **FP**: test `publicSignUpAlwaysCreatesASolicitante` |
| CSRF | Bearer token in a header, no cookies, stateless sessions | **FP** |
| Self-approval / duplicate approver / sequence bypass | `ApprovalPolicies.requireEligible/requireSegregation`, chain built server-side, only the current `PENDING` step is decidable | **FP**: `WorkflowIntegrationTest.segregationOfDuties`, `aSolicitanteCannotDecide…` |
| Double approval / double budget consumption / overspend | `lock_version` claim as the first write, guarded step UPDATE, conditional budget UPDATE, `CHECK (consumed ≤ amount)` | **FP**: `ConcurrencyIntegrationTest` (3), `terminalRequestsCannotBeChangedOrDecidedAgainAndBudgetIsConsumedOnce` |
| Invalid transitions / terminal states | `RequestStateMachine` (EnumMap); edits only in `DRAFT`/`CHANGES_REQUESTED` by the owner | **FP** |
| History tampering | V5 triggers on events, versions, version items; V7 on decided steps | **FP**: `historyAndSnapshotsAreImmutableInTheDatabase`, `decidedApprovalSteps…` |
| Idempotency abuse | Key scoped per user (`PRIMARY KEY (user_id, idem_key)`); SHA-256 over every payload field; a replay returns only the caller's own earlier response; validation ran on the first create | **FP** |
| Money precision / overflow | Integer cents, `Math.*Exact` → 400 on overflow; regex limits 13+2 digits; `CHECK` constraints `> 0`, `≥ 0` | **FP** |
| JWT algorithm confusion / `none` | Decoder pinned to HS256 | **FP**: `JwtValidationTest.rejectsTheNoneAlgorithm` |
| Password storage | `BCryptPasswordEncoder` (cost 10); hash never serialized (`UserMapping`) | **FP**: Argon2id would be stronger, but bcrypt is what README §2.1 asks for |
| User enumeration via login | Same message for every failure; a dummy-hash comparison keeps the timing flat | **FP** |
| Header injection | `X-Request-Id` accepted only if it matches `^[A-Za-z0-9._:-]{1,64}$` | **FP** |
| CORS | Not configured, so browsers enforce same-origin; the SPA uses a same-origin `/api` proxy | **FP** |
| Container root | Runtime image runs as non-root `app` (uid 10001) | **FP** |
| File upload / path traversal / command execution | No such feature in the code | Not applicable |
