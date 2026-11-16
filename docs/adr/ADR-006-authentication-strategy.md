# ADR-006 — Authentication Strategy: Stateless Short-Lived JWT

**Status:** Accepted · revised 2026-11-15 to match the Spring implementation
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
Option 1, with Spring Security's OAuth2 Resource Server:
- `JwtService` signs HS256 tokens with `NimbusJwtEncoder`; claims `iss`, `sub` (user id), `iat`, `exp`
  (= iat + `JWT_TTL`, default `PT15M`), `jti`, `role`, `name`, and `costCenterId` / `approverLevel` when present.
- `NimbusJwtDecoder` validates signature, `exp`/`nbf` and the issuer.
- The signing key comes only from `JWT_SECRET`; the application **refuses to start** if it is shorter
  than 32 bytes (HS256 needs ≥ 256 bits).
- Passwords: `BCryptPasswordEncoder`. Login failures always answer the same `401` and run a dummy hash
  comparison for unknown e-mails, so timing does not reveal which e-mails exist.
- **Claims are informational.** On every request `CurrentUser` re-loads the user from the database (and
  rejects inactive users), so a role/level/cost-center change or a deactivation takes effect immediately
  instead of after the token expires.

## Rationale
The challenge mandates only the short-lived token; refresh infrastructure is a differentiator. Stateless
tokens need no session store. Re-loading the user per request closes the main weakness of stateless JWTs
(stale authorization data) at the cost of one primary-key lookup.

## Consequences
- The front end stores the token in `sessionStorage` and handles `401` globally (back to `/login?returnUrl=…`).
- Revocation = wait ≤ 15 min, or deactivate the user (effective on the next request).

## Trade-offs
No refresh token: users sign in again every 15 minutes (accepted for the challenge). One DB read per request.

## Implementation
`security/JwtService`, `security/SecurityConfig` (encoder, decoder, key-length check, BCrypt),
`security/CurrentUser`, `application/AuthService`; front end `src/shared/auth/AuthContext.tsx`.

## Related
ADR-007 (authorization), ADR-013 (front end); SEC-001/002/005.
