# Final Security Report — 2026-11-15

Scope and limits: [SECURITY-SCOPE.md](SECURITY-SCOPE.md). This report does **not** claim the application is secure. It states what was examined, what was found and fixed, and what remains unverified or open.

## 1. Overall posture

The core design is sound. Authorization is enforced server-side on every route, with visibility (404) before role and ownership (403). Business invariants are enforced in code and backed by database constraints and triggers. No query is string-built, and no unsafe HTML sink exists in the SPA.

The audit found **no critical or high vulnerability**. The weaknesses were concentrated at the edges:
- authentication abuse (brute force, an example secret usable as a real key);
- resource limits (body size);
- insecure **defaults** (a production front-end build that ran the fake backend and advertised admin credentials; the seed password in logs);
- defense in depth for audit data;
- missing supply-chain automation.

The largest caveat: **the back end has never been compiled or run**, in this audit or before it. Back-end fixes and their tests are written but unverified (R-01).

## 2. Findings by severity

| Critical | High | Medium | Low | Informational | Total |
|---|---|---|---|---|---|
| 0 | 0 | 6 | 14 | 7 | 27 |

## 3. Confirmed vulnerabilities (C1)

- **SEC-F04:** the production build defaulted to the in-browser fake backend, and the login screen pre-filled ADMIN credentials. Reproduced by building and inspecting the bundle; fixed and verified.

## 4. Confirmed weaknesses and potential issues

- **C2:**
  - Medium: SEC-F01, F02, F03, F13, F18.
  - Low: F05–F12, F14, F15, F17, F19, F23.
- **C3:** F16 (no CSP; no XSS sink found), F20 (back-end SCA not run).

## 5. False positives

SQL injection, XSS, mass assignment, BOLA on requests, vertical escalation, CSRF, self-approval, double approval or consumption, invalid transitions, history tampering, idempotency abuse, money precision, JWT `none`/algorithm confusion, login enumeration, header injection, CORS. Evidence for each is in FINDINGS § False positives.

## 6. Remediated

| Verified (test executed and passed) | Fixed, unverified (back end: no JDK or Docker) |
|---|---|
| SEC-F02 (Cypress 8/8), SEC-F04 (bundle inspection + Cypress 54/54) | SEC-F01, F03, F05, F06, F07, F08, F09, F10, F12, F13; partial F11; F25 toggle; F26 pipeline (not yet run) |

## 7. Unresolved

| Open | Accepted (with expiry or justification) |
|---|---|
| F16 CSP/headers for the SPA host; F17 DB least privilege; F20 back-end SCA; F22 TLS, image digests, compose | F11 seed default (README requirement); F14 budget read (README contract); F15 sign-up 409 (contract); F18 dev-tool advisories (**until 2027-02-15**); F19 (mitigated); F21, F23, F24, F27 (design or dev defaults) |

## 8. Unverified fixes

Every back-end change: 37 regression tests (23 unit, 14 Testcontainers) await their first run. The likely failure mode is a compile error against Spring Boot 4.1 / Security 7 / Jackson 3 APIs, because nothing could be compiled here. Fix forward; don't relax the assertions.

## 9. Dependency risks

- **Front end:** one runtime advisory family (React Router 6, mitigated); the rest are dev-only highs and moderates (Vite, esbuild, Cypress chain) that need major upgrades.
- **Back end:** unscanned; the CI Dependency-Check and dependency review are in place.
- Details: [DEPENDENCY-AUDIT.md](DEPENDENCY-AUDIT.md).

## 10. Authentication and authorization assessment

**Authentication** is now:
- bcrypt with the byte limit enforced;
- throttled login with a uniform failure message;
- HS256 pinned, with `iss`/`aud`/`exp` validated;
- a 15-min TTL, and a start-up refusal of weak or placeholder secrets.

Still missing: refresh or revocation, and sign-up throttling.

**Authorization** is consistent: one visibility predicate for every read, owner and ADMIN checks in services, roles from the database (not from the token), and server-computed `allowedActions`. The one accepted inconsistency is the budget `GET` (F14).

## 11. Business-logic assessment

Every rule required by the brief holds by design and by test:
- **segregation:** self-approval and the same approver on two steps are blocked per version;
- **sequence and eligibility:** only the current step can be decided, by an approver eligible for the version's cost center;
- **state:** invalid transitions and terminal states are refused;
- **budget:** consumed exactly once, never overdrawn, even under concurrency;
- **history:** previous versions immutable, and decided steps immutable (new);
- **idempotency:** keyed per user and bound to the payload hash;
- **money:** exact cents arithmetic.

The concurrency tests exist (`ConcurrencyIntegrationTest`) but share R-01: not yet executed.

## 12. Infrastructure assessment

- **In place:** non-root JRE container; secrets only from env; Actuator limited to `/health`; docs can be disabled; CI security pipeline defined.
- **Missing:** a compose file, TLS, image pinning and scanning, a separate DB role, and security headers for the SPA host.

## 13. Recommendations (priority order)

1. Run `./mvnw verify` with Docker (or push and let CI run), and fix anything that fails (R-01).
2. Push `security.yml`, add `NVD_API_KEY`, and make the checks required in branch protection (R-14, R-02).
3. Production configuration: `SEED_ENABLED=false`, a random `JWT_SECRET`, an explicit `DB_PASSWORD`, `API_DOCS_ENABLED=false` if docs should be private.
4. Separate the Flyway role from the runtime role (R-11).
5. When adding `docker-compose.yml` and SPA hosting: TLS at ingress, CSP and headers, image digests, no published database port.
6. Throttle `/auth/register`; consider progressive delays instead of a hard lockout.
7. Upgrade Vite, Cypress and React Router in a dedicated change before 2027-02-15.
8. Add HTTP-level security tests (MockMvc) and a ZAP baseline against a local instance.

## 14. Residual risks

See [RISK-REGISTER.md](RISK-REGISTER.md). The highest residual risks are R-01 (unexecuted back-end code), R-03 (seed on by default, by challenge requirement), R-09 (dev-tool advisories), R-11 (DB owner role) and R-13/R-14 (infrastructure and CI not yet active).
