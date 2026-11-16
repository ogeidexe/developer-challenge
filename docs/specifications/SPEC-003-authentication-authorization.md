# SPEC-003 — Authentication & Authorization

## 1. Specification Metadata
- **ID:** SPEC-003 · **Feature:** Auth (register/login/me, JWT, guards) · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (4–6 h) · **Dependencies:** SPEC-001, SPEC-002 · **Wave:** 1
- **Responsible agent:** AGENT-SPEC-003 · **Status:** implemented — drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
The security perimeter: short-lived JWTs carrying role/cost-center/level, coarse role guards, and the
public registration that can only create `SOLICITANTE` (README §2.1). All business authorization builds on it.

## 3. Scope
**In (as built):** `POST /auth/register`, `POST /auth/login`, `GET /auth/me`; `JwtService` (HS256 via Nimbus, `JWT_TTL` default 15 min, claims `sub/role/name/costCenterId?/approverLevel?/iat/exp/iss/jti`); `BCryptPasswordEncoder`; `SecurityConfig` (resource server, public routes, problem+json 401/403); `CurrentUser` (user re-loaded from the DB per request).
**Out:** user administration (SPEC-004); role/ownership/business authorization (in the services — `RequestAccess`, SPEC-009 policies; the filter chain only authenticates).

## 4. Requirements
FR-001 · FR-002 · FR-003 · FR-004 · FR-041 · FR-042 · FR-043 · SEC-001 · SEC-002 · SEC-005 · SEC-006 · SEC-007 · NFR-018 · BR-014 (401/403 stages)

## 5. Business Rules
- Register always creates `SOLICITANTE`, bound to an **existing cost center informed in the payload** (`costCenterId` required — a new user has no "own" center; SEC-006/A-15); role/level fields in the payload are ignored.
- Passwords: min 8 chars, ≥1 letter, ≥1 digit; hash never leaves the server (SEC-005).
- Token expiry is enforced from `exp`; clock skew tolerance ≤ 30 s.
- Login failure → generic 401 (no user-enumeration detail).

## 6. Architecture (as implemented)
Spring Security OAuth2 Resource Server. `security.SecurityConfig`: stateless, CSRF off, public routes (`POST /auth/register|login`, `GET /health`, `GET /cost-centers`, docs), everything else authenticated; `NimbusJwtEncoder`/`NimbusJwtDecoder` (HS256, issuer validated); key from `JWT_SECRET` (≥ 32 bytes or start-up fails); `BCryptPasswordEncoder`. `security.JwtService` issues tokens; `application.AuthService` registers (always SOLICITANTE) and logs in (dummy-hash comparison for unknown e-mails); `security.CurrentUser` re-loads the `Actor` from the DB on every request. Role/ownership checks are in the services (`RequestAccess`), not in the filter chain (ADR-007).

## 7. API Contract
Exactly `openapi.yaml` operations `registerUser` (201 UserDto), `login` (200 LoginResponse with `token`, `tokenType=Bearer`, `expiresIn=900`), `getMe` (200 UserDto). Errors: 400 VALIDATION_FAILED, 401, 409 EMAIL_ALREADY_REGISTERED (login/register), 500.

## 8. Database Impact
Table `users` (SPEC-002). Reads by email; inserts at register. No new migrations.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Ports + bcrypt adapter + tests | hasher round-trip | UT-27 |
| T02 JwtTokenService issue/verify | claims shape | UT-26 |
| T03 AuthService.register/login | DTOs per contract | AT-01/AT-02 |
| T04 AuthController + DTO validation | endpoints | AT-01..AT-03 |
| T05 JwtAuthGuard + RolesGuard + decorators | 401/403 before handlers | AT-21 |
| T06 Wire /auth/me | current user | AT-03 |

## 10. Testing Strategy
Unit: password hash/verify; JWT claims/expiry; register ignores role override. API: full login flow;
expired-token 401; `SOLICITANTE` hitting `POST /users` → 403; password absent from every response (assert on all auth payloads).

## 11. Acceptance Criteria
- **G**iven valid credentials **W**hen login **T**hen response contains a JWT whose decoded claims include `sub`, `role`, `costCenterId`, `exp=iat+900`, and no password/hash anywhere.
- **G**iven a registration payload with `"role": "ADMIN"` **W**hen registering **T**hen the created user has `role=SOLICITANTE`.
- **G**iven an expired token **W**hen calling any protected endpoint **T**hen 401 problem+json.

## 12. Integration Requirements
`CurrentUser.get()` is called by every controller (SPEC-004–014). The token claims are informational; the user is always re-loaded from the database.

## 13. Risks
JWT secret via env with weak dev default — require minimum entropy check in config validation.

## 14. Definition of Done
AT-01/02/03/21 green; unit coverage ≥90% on auth services; no hash in any serialized DTO (asserted); AI-logged.
