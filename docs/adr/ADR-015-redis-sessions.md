# ADR-015 — Server-Side Sessions in Redis for the JWT

**Status:** Accepted · reviewed 2026-11-18 against the implementation
**Date:** 2026-11-16

## Context
Authentication is a short-lived (15 min) HS256 JWT (ADR-006). A pure stateless JWT cannot be revoked: "logout"
only deletes the token in the browser, and a stolen token keeps working until `exp`. README §6 lists
"refresh token com rotação e revogação" as a differentiator, and the project now runs Redis in the compose stack.

## Problem
Make logout and revocation real without giving up the JWT (claims, signature validation, no server lookup for
authorization data that is already reloaded from the database by `CurrentUser`).

## Options
1. **Stateless JWT only** (previous state): simplest; no revocation.
2. **Denylist of revoked `jti`s in Redis**: a lookup only to find revoked tokens; an empty or flushed Redis
   silently re-enables every revoked token (fails open).
3. **Allowlist: one Redis session per issued token** (`session:<jti>` → user id, TTL = token TTL); a token is
   accepted only while its session exists.
4. **Spring Session with an HTTP session cookie in Redis**: replaces the JWT and the API contract (README
   §2.1 asks for a JWT), and brings CSRF concerns back.

## Decision
Option 3.
- `JwtService.issue` generates the `jti`, signs the token and opens the session in Redis with the token's TTL
  (`SessionStore.open`).
- The `JwtDecoder` bean (`SecurityConfig.sessionAwareJwtDecoder`) runs the existing validators (HS256, `iss`,
  `aud`, `exp`) **plus** `SessionStore.validator()`: no session → `401 UNAUTHENTICATED` (problem+json).
- `POST /auth/logout` (authenticated, `204`) deletes the caller's session; the same token is a `401` from the
  next request on. The frontend calls it when the user signs out (best effort; the local session is cleared
  regardless).
- Redis runs in the compose network only (not published), without persistence: a Redis restart ends every
  session, and users sign in again.

## Consequences
- **Fails closed:** if Redis is unreachable, tokens cannot be validated and requests get `401`; `/health`
  reports Redis, so the outage is visible (the gateway and the compose healthcheck depend on it).
- One Redis `EXISTS` per authenticated request (sub-millisecond on the compose network).
- Sessions expire by themselves (TTL), so Redis holds at most one key per token issued in the last 15 minutes.
- Not done: refresh tokens and "log out every session of a user" (would need a per-user index of `jti`s).
  Role changes do not need it: `CurrentUser` reloads the user from the database on every request.

## Verification
`HttpContractIntegrationTest#logoutEndsTheSessionImmediately`, `#eachLoginOpensARedisSessionWithTheTokenLifetime`
(real HTTP + Redis Testcontainer); the real-API Cypress spec logs out through the UI and checks the old token is
rejected; the CI compose smoke test checks `/health` has Redis `UP` and that logout turns the token into a `401`.
Manual walkthrough item AUTH-06 repeats it on screen (the saved token answers `401` after "Sair").
