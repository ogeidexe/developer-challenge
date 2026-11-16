# Security Test Plan

Every scenario has an ID, a test or a manual procedure, and its status in [SECURITY-TEST-RESULTS.md](SECURITY-TEST-RESULTS.md).

**Run commands:**

| Command | What it runs | Needs |
|---|---|---|
| `cd backend && ./mvnw verify` | unit + integration security tests | JDK 25; Docker for Testcontainers |
| `cd frontend && npm run test:e2e` | Cypress, including `09-security.cy.ts` | Node only (fake backend) |
| `.github/workflows/security.yml` | everything above, plus SCA, secrets and SAST | GitHub Actions |

## Authentication

| ID | Scenario | Expected | Test |
|---|---|---|---|
| AUTH-01 | Invalid credentials (unknown e-mail / wrong password) | 401, identical message | `SecurityIntegrationTest.unknownEmailAndWrongPasswordFailIdentically` |
| AUTH-02 | Expired JWT | rejected | `JwtValidationTest.rejectsAnExpiredToken` |
| AUTH-03 | Tampered payload (role escalated to ADMIN) | rejected | `JwtValidationTest.rejectsATamperedPayload` |
| AUTH-04 | Wrong issuer | rejected | `JwtValidationTest.rejectsAWrongIssuer` |
| AUTH-05 | Wrong / missing audience | rejected | `JwtValidationTest.rejectsAWrongOrMissingAudience` |
| AUTH-06 | Missing `exp` | rejected | `JwtValidationTest.rejectsATokenWithoutExpiry` |
| AUTH-07 | `alg: none` / other key | rejected | `JwtValidationTest.rejectsTheNoneAlgorithm`, `rejectsATokenSignedWithAnotherKey` |
| AUTH-08 | Missing token on a protected route | 401 problem+json | Manual / HTTP-level backlog T-API-01 (filter chain `anyRequest().authenticated()`) |
| AUTH-09 | Revoked session (user deactivated) | 401 on the next request | `CurrentUser` re-load; HTTP-level test in backlog T-API-02 |
| AUTH-10 | Repeated failed logins | 429 after 5, even with the right password; other accounts unaffected | `LoginAttemptLimiterTest`, `SecurityIntegrationTest.repeatedWrongPasswords…` |
| AUTH-11 | Weak / placeholder signing secret | start-up refused | `JwtValidationTest.refusesToStartWith…` (2) |
| AUTH-12 | Over-long (> 72 bytes) password | 400 on sign-up; 401 on login; never 500 | `InputHardeningTest`, `SecurityIntegrationTest.passwordsLongerThanBcrypt…` |
| AUTH-13 | Issued token claims | `aud`, `exp`, `sub` present and validated | `SecurityIntegrationTest.issuedTokensCarryAudience…` |

## Authorization

| ID | Scenario | Expected | Test |
|---|---|---|---|
| AZ-01 | Requester reads / edits / submits / cancels another user's request | 404 | `SecurityIntegrationTest.anotherRequesterCannot…` |
| AZ-02 | Approver of another cost center reads or approves | 404 | `SecurityIntegrationTest.anApproverOfAnotherCostCenter…` |
| AZ-03 | Approver edits a visible request | 403 `NOT_REQUEST_OWNER` | `SecurityIntegrationTest.anApproverWhoCanSee…` |
| AZ-04 | `SOLICITANTE` approves | 403 | `SecurityIntegrationTest.aSolicitanteCannotDecide…` |
| AZ-05 | ADMIN reads someone's draft | 404 | `WorkflowIntegrationTest.draftsAreInvisibleEvenToAdmin` |
| AZ-06 | Sign-up tries to become ADMIN | always `SOLICITANTE` | `SecurityIntegrationTest.publicSignUpAlwaysCreatesASolicitante` |
| AZ-07 | Non-ADMIN calls `/users`, `PUT budgets`, `POST cost-centers` | 403 | Code review (`requireAdmin` at the start of every method); HTTP-level backlog T-API-03 |
| AZ-08 | UI hides actions the API forbids | buttons from `allowedActions` | Cypress `05-request-detail`, `06-inbox`, `08-navigation` |

## Input validation

| ID | Scenario | Expected | Test |
|---|---|---|---|
| IV-01 | Unexpected JSON properties (`total`, `status`, `ownerId`) | ignored; total computed | `SecurityIntegrationTest.theClientCannotChooseTheTotal` |
| IV-02 | Oversized body (declared / chunked) | 413 | `RequestSizeLimitFilterTest` |
| IV-03 | LIKE wildcards / over-long search | literal match / 400 | `InputHardeningTest`, `SecurityIntegrationTest.searchWildcardsMatchLiterally` |
| IV-04 | Negative, zero or over-precise money; overflow | 400 | `MoneyAndCalendarTest` (existing), DTO regex |
| IV-05 | Invalid UUID / enum / malformed JSON | 400 (type mismatch / unreadable) | `GlobalExceptionHandler` handlers; HTTP-level backlog T-API-04 |
| IV-06 | SQL injection payloads in `q`, `sort` | bound parameter / 400 `INVALID_SORT` | Code review (no string-built SQL); `parseSort` whitelist |
| IV-07 | XSS payload in title or comment | rendered as text | Code review (no unsafe HTML sinks); React escaping |
| IV-08 | Hostile `returnUrl` (absolute, `//`, backslash, `javascript:`, tab, login loop) | lands on `/` | `cypress/e2e/09-security.cy.ts` |

## Business logic

| ID | Scenario | Expected | Test |
|---|---|---|---|
| BL-01 | Self-approval | 422 `SELF_APPROVAL_FORBIDDEN` | `WorkflowIntegrationTest.segregationOfDuties` |
| BL-02 | Same approver on two steps | 422 `DUPLICATE_APPROVER` | `WorkflowIntegrationTest.segregationOfDuties` |
| BL-03 | Concurrent approvals of the same step | one 200, one 409 | `ConcurrencyIntegrationTest.twoApprovalsOfTheSameStep…` |
| BL-04 | Concurrent final approvals over the budget | never negative; 422 for the excess | `ConcurrencyIntegrationTest.finalApprovalsOfDifferentRequestsNeverOverdraw…` |
| BL-05 | Approve or cancel a terminal request; budget consumed once | 422; consumed unchanged | `SecurityIntegrationTest.terminalRequests…` |
| BL-06 | Stale `lockVersion` | 409, nothing changed | `WorkflowIntegrationTest.staleLockVersionIs409…` |
| BL-07 | Duplicate create (idempotency) / different payload with the same key | replay / 409 | `WorkflowIntegrationTest.idempotentCreateReplays…` |
| BL-08 | Rewrite history / versions | DB error | `WorkflowIntegrationTest.historyAndSnapshotsAreImmutable…` |
| BL-09 | Rewrite or delete a decided step | DB error | `SecurityIntegrationTest.decidedApprovalSteps…` |
| BL-10 | Duplicate account differing only by case | unique violation | `SecurityIntegrationTest.emailUniqueness…` |

## Infrastructure

| ID | Scenario | Expected | Check |
|---|---|---|---|
| INF-01 | Secrets in tree or history | none | Pattern scan (SECRETS-AUDIT); gitleaks in CI |
| INF-02 | Production bundle contains demo credentials or the mock | none | `vite build` + grep (SECURITY-TEST-RESULTS) |
| INF-03 | Container runs as root | no | `Dockerfile` review; hadolint in CI |
| INF-04 | Security headers on the API | nosniff, `X-Frame-Options`, cache-control | Spring Security defaults; HTTP-level backlog T-API-05 |
| INF-05 | CORS | no `Access-Control-Allow-Origin` | Not configured (review) |
| INF-06 | Debug endpoints | only `/health` exposed by Actuator | `management.endpoints.web.exposure.include: health` |

## DAST (not run)

OWASP ZAP baseline scan against a local instance once the back end can be started: `docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t http://host.docker.internal:3000/v3/api-docs -f openapi`. Only against local or test instances.
