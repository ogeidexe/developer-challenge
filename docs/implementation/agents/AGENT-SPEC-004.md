# AGENT-SPEC-004 — User & Role Management

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement ADMIN-only user administration: `GET/POST /users`, `PATCH /users/:id`, with role/level/cost-center consistency rules and optimistic locking.

## Mandatory reading order
1. `README.md` (§2.1) + `AGENTS.md`.
2. `docs/api/openapi.yaml` (`listUsers`, `createUser`, `updateUser`), `docs/api/ERROR-CATALOG.md`.
3. `docs/database/DATA-DICTIONARY.md` (`users` table), `SHARED-CONTRACTS.md`.
4. `docs/specifications/SPEC-004-user-role-management.md`.

## Rules
- Work only in `backend/src/modules/users/**` (controller, service, DTOs) + `backend/src/domain/user/policy*`.
- Reuse SPEC-003 guards/`@CurrentUser`/`UserRepository` — do not reimplement auth.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- List: pagination + filters `role`, `costCenterId`, `q` (name/email substring).
- Create: any role/level; `approverLevel` required iff APROVADOR; `costCenterId` null allowed only for ADMIN.
- Patch: name/role/approverLevel/costCenterId/active with optimistic `lock_version` (409 + `currentLockVersion`).
- Pure `UserRolePolicy.validateRoleConsistency` with full matrix tests.

## Contracts you must not break
- 403 before any business check for non-ADMIN (action-type stage); 400 with `errors[]` for shape violations; `UserDto` frozen; hash never exposed.

## Validation
- `npm test` green: UT-28 matrix, AT-04/05 (non-ADMIN 403; APROVADOR without level 400 field error; duplicate email 409; stale lock 409).

## Report format
Modified files, test summary, deviations, blockers.
