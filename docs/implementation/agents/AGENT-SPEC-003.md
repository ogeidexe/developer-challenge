# AGENT-SPEC-003 — Authentication & Authorization

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement the security perimeter: register/login/me, JWT issuance/verification (15 min), bcrypt
hashing, JwtAuthGuard + RolesGuard + `@CurrentUser`. All later modules depend on your guards.

## Mandatory reading order
1. `README.md` (§2.1) + `AGENTS.md`.
2. `docs/api/API-DESIGN.md` (§2, §4.2), `docs/api/openapi.yaml` (operations `registerUser`, `login`, `getMe`).
3. `docs/architecture/diagrams/auth-flow.md`, `docs/implementation/SHARED-CONTRACTS.md`.
4. `docs/specifications/SPEC-003-authentication-authorization.md`.

## Rules
- Work only in `backend/src/infrastructure/http/**` (guards, decorators, auth controller folder as `modules/auth`), `backend/src/application/services/auth*`, `backend/src/application/ports/{token,password}.ts`, `backend/src/domain/user/*` (minimal), `backend/src/infrastructure/security/**`.
- Do NOT implement `/users` admin (SPEC-004). Do NOT do fine-grained business authorization (SPEC-009).
- AI-log snapshot/record; commit trailers.

## Scope (in)
- `POST /auth/register` (always SOLICITANTE with `approverLevel=null`; `costCenterId` **required** in the payload and must reference an existing center — a new user has no "own" center, SEC-006/A-15; 201 UserDto; 409 duplicate email).
- `POST /auth/login` (generic 401 on failure; 200 `{token, tokenType:"Bearer", expiresIn:900, user}`).
- `GET /auth/me`.
- Claims: `sub`, `role`, `costCenterId` (nullable), `approverLevel` (nullable), `iat`, `exp=iat+900`, `iss`, `jti`. Env: `JWT_SECRET` (min entropy check), `JWT_ISSUER`.
- Bcrypt cost ≥10; hash never serialized (assert in tests).

## Contracts you must not break
- Problem+json errors per ERROR-CATALOG; guards run before controllers (401/403 stages of BR-014).
- `UserDto` shape frozen per openapi.yaml.

## Validation
- Unit: hasher round-trip, JWT claims/expiry, register ignores role override.
- API tests AT-01/02/03/21 green: login flow; expired token 401; SOLICITANTE on `POST /users` → 403; no password/hash in any response payload.

## Report format
Modified files, test summary, deviations, blockers.
