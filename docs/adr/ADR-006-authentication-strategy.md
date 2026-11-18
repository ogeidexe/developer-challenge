# ADR-006 — Authentication Strategy: Short-Lived JWT, Backed by a Server-Side Session

**Status:** Accepted · revised 2026-11-18 to match the current implementation (sessions in Redis: ADR-015)
**Date:** 2026-11-15

## Context
README §2.1 requires login returning a JWT of short duration (example 15 min) with claims `sub`, `role`,
`costCenterId`, `approverLevel`; §6 lists refresh tokens with rotation/revocation as a differentiator.

## Problem
Choose an authN design that is secure, simple and within mandatory scope.

## Options Considered
1. **Access token only** (15 min JWT) — logout is client-side discard.
2. Access + refresh token (rotation, revocation table).
3. Server-side sessions.

## Decision
Option 1, with Spring Security's OAuth2 Resource Server, later backed by a server-side session per token
(a narrow form of option 3, ADR-015) so that logout and revocation are real:
- `JwtService` signs HS256 tokens with `NimbusJwtEncoder`; claims `iss`, `sub` (user id), `iat`, `exp`
  (= iat + `JWT_TTL`, default `PT15M`), `jti`, `role`, `name`, and `costCenterId` / `approverLevel` when present.
- `NimbusJwtDecoder` is pinned to HS256 and validates the signature, `exp`/`nbf`, the issuer, the audience
  (`aud` = `JWT_AUDIENCE`, issued in every token) and requires `exp` (SEC-F08); since ADR-015 it also
  requires the token's Redis session (`session:<jti>`) to exist.
- The signing key comes only from `JWT_SECRET`; the application **refuses to start** if it is shorter
  than 32 bytes (HS256 needs ≥ 256 bits) or is a documented placeholder (SEC-F13). Compose generates a
  random secret on the first start when none is set.
- Passwords: `BCryptPasswordEncoder`, at most 72 bytes (bcrypt's limit, SEC-F05), letters and digits. Login
  failures always answer the same `401` and run a dummy hash comparison for unknown e-mails, so timing does
  not reveal which e-mails exist.
- **Throttling:** `LoginAttemptLimiter` blocks an account after 5 failures and a client after 50 in 15
  minutes (`429` with `Retry-After`, SEC-F01); the Nginx gateway adds a per-IP limit on `/api/auth/login`
  (ADR-016).
- **Claims are informational.** On every request `CurrentUser` re-loads the user from the database (and
  rejects inactive users), so a role/level/cost-center change or a deactivation takes effect immediately
  instead of after the token expires.

## Rationale
The challenge mandates only the short-lived token; refresh infrastructure is a differentiator. Re-loading
the user per request closes the main weakness of stateless JWTs (stale authorization data) at the cost of
one primary-key lookup. The remaining weakness — a token cannot be revoked — is closed by the Redis
session (ADR-015) without changing the token or the API contract.

## Consequences
- The front end stores the token in `sessionStorage` and handles `401` globally (back to `/login?returnUrl=…`).
- Revocation: `POST /auth/logout` ends the session at once (the same token is a `401` afterwards); deactivating
  a user or changing their role takes effect on their next request.
- The front end clears its cached server data whenever the session changes (login, logout, expiry), so the
  next user never sees the previous user's screens.

## Trade-offs
No refresh token: users sign in again every 15 minutes (accepted for the challenge). One DB read and one
Redis lookup per request; Redis down means every token is refused (fails closed, visible in `/health`).

## Implementation
`security/JwtService`, `security/SecurityConfig` (encoder, session-aware decoder, key checks, BCrypt),
`security/SessionStore`, `security/LoginAttemptLimiter`, `security/CurrentUser`, `application/AuthService`,
`application/PasswordRules`; front end `src/shared/auth/AuthContext.tsx`.

## Verification
`JwtValidationTest` (wrong issuer or audience, expired, no `exp`, tampered, other key, `alg: none`, short and
placeholder secrets), `LoginAttemptLimiterTest`, `SecurityIntegrationTest` (issued claims, lockout, identical
failures, 72-byte passwords), `HttpContractIntegrationTest` (`/auth/me` without password, role change on an issued
token, logout, one Redis session per login). Cypress checklist AUTH-03 and AUTH-08, in both suites.

## Related
ADR-007 (authorization), ADR-013 (front end); SEC-001/002/005.
