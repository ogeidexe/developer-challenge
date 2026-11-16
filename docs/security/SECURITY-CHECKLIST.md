# Security Checklist (ASVS-oriented)

✔ done · ◐ done, not yet verified by an executed test · ✖ open · n/a not applicable

## Authentication and session

- ✔ Passwords hashed with bcrypt; hash never returned (`UserMapping`).
- ◐ Password ≤ 72 bytes enforced; same policy for sign-up and admin create (F05, F12).
- ◐ Login throttling per account and per client, 429 + `Retry-After` (F01).
- ✔ Same login failure message; dummy hash for unknown e-mails.
- ◐ JWT: HS256 pinned; `iss`, `aud`, `exp` required; 15-min TTL (F08).
- ◐ Start-up refuses a short or placeholder `JWT_SECRET` (F13).
- ✔ User re-loaded on every request (deactivation and role changes immediate).
- ✖ Refresh-token rotation / revocation list (F27, README differentiator).
- ✖ Throttling of `/auth/register` (F15).

## Access control

- ✔ Deny by default in the filter chain; public routes enumerated.
- ✔ Visibility predicate shared by list, detail, history, versions and dashboard; 404 before 403.
- ✔ Owner checks for edit, submit and cancel; ADMIN checks for users, cost centers and budgets.
- ✔ Sign-up always `SOLICITANTE`; no role or privileged field in the input DTOs.
- ✔ `allowedActions` computed server-side; the UI never decides.
- ✖ Budget read restricted to the user's own center (F14; accepted contract).

## Business logic

- ✔ Server-built approval chain; only the current step is decidable.
- ✔ Self-approval and duplicate approver blocked per version.
- ✔ State machine; edits only in `DRAFT`/`CHANGES_REQUESTED`.
- ✔ Lock claim first; status-guarded step update; conditional budget consume + CHECK.
- ✔ Versions and events immutable (V5); ◐ decided steps immutable (V7, F07).
- ✔ Idempotency per user + payload hash.
- ✔ Exact integer cents; overflow → 400.

## Input, output and errors

- ✔ Bean validation on all bodies; money regex; sort whitelist; page size ≤ 100.
- ◐ Body ≤ 1 MiB (F03); LIKE escaping, search ≤ 100 characters (F09).
- ✔ problem+json without internals; ◐ framework 4xx no longer 500 (F10).
- ✔ `X-Request-Id` sanitized; no unsafe HTML sinks in the SPA.
- ✔ Open redirect fixed and tested (F02).

## Configuration and infrastructure

- ✔ Secrets only from env; ✔ example secret empty (F13).
- ✔ Demo credentials and mock excluded from production builds (F04).
- ◐ Seed password no longer logged (F11); ✖ seed default stays on (R-03).
- ✔ Container non-root, JRE-only runtime.
- ✖ Image digests, image scan, TLS at ingress, compose hardening (F22).
- ✖ Separate DB migration and runtime roles (F17).
- ◐ API docs toggle (F25).
- ✖ CSP and security headers for the SPA host (F16).

## Supply chain and CI

- ✔ Lockfile committed; `npm ci --ignore-scripts` in CI.
- ◐ CI: npm audit, dependency review, gitleaks, CodeQL, back-end tests, Dependency-Check, hadolint (F26).
- ✖ Front-end dev-tool major upgrades (F18, expires 2027-02-15); ✖ React Router 7 (F19).
- ✖ Back-end SCA result recorded (F20).
- ✖ Actions pinned by SHA; Dependabot configuration.

## Testing

- ✔ Cypress security spec (8) and full suite (54/54).
- ◐ 37 back-end security tests written (unit 23, integration 14).
- ✖ HTTP-level API security tests (T-API-01…05); ✖ DAST (ZAP baseline).
