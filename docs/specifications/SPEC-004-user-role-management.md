# SPEC-004 — User & Role Management

## 1. Specification Metadata
- **ID:** SPEC-004 · **Feature:** User administration (`/users`) · **Version:** 1.0
- **Priority:** P1 · **Complexity:** S (2–3 h) · **Dependencies:** SPEC-003 · **Wave:** 2
- **Responsible agent:** AGENT-SPEC-004 · **Status:** implemented — drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
ADMIN-only management of accounts: create users in any role/level, edit role, level, cost center and
activation (README §2.1). Feeds approver eligibility (SPEC-009) and the admin front-end (SPEC-018).

## 3. Scope
**In:** `GET /users` (paginated, filters role/costCenterId/q), `POST /users`, `PATCH /users/:id`.
**Out:** self-service profile editing; password reset (out of scope, documented).

## 4. Requirements
FR-005 · FR-044 · FR-045 · SEC-004 · SEC-005 · NFR-019 · NFR-023

## 5. Business Rules
- Only `ADMIN` mutates users (403 otherwise — action-type check before business rules).
- `approverLevel` is required iff role=`APROVADOR`; must be null for other roles (400 otherwise).
- `costCenterId` may be null **only** for `ADMIN` (global admin).
- Deactivating a user (`active=false`) blocks login and excludes them from eligibility/inbox without deleting data.
- Admin edits use optimistic `lock_version` — mismatch → 409.

## 6. Architecture (as implemented)
`application.UserAdminService` (`list` with a Specification, `create`, `update` with explicit `lockVersion` check → 409); `validateProfile` enforces level iff APROVADOR, null center only for ADMIN, existing center (400 with `errors[]`). DTOs in `api.dto.AdminDtos`; endpoints in `api.AdminController`. Front end: `AdminPage` › Usuários.

## 7. API Contract
Operations `listUsers`, `createUser`, `updateUser`. Errors: 400 VALIDATION_FAILED (with errors[]),
401, 403, 404, 409 (email/code conflicts; stale lock), 422 not used here (role-shape issues are 400 input validation).

## 8. Database Impact
Table `users` only. No schema change.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 `UserRolePolicy` pure function + table tests | rule matrix | UT-28 |
| T02 `UserAdminService` create/list/update | service | unit |
| T03 `UserAdminController` + guards + DTOs | endpoints | AT-04/AT-05 |
| T04 optimistic lock on PATCH | 409 path | CT-04 (variant) |

## 10. Testing Strategy
Unit: role-consistency matrix. API: non-ADMIN → 403; `APROVADOR` without level → 400 with field error;
duplicate email → 409; PATCH with stale lock → 409; response contains no password hash.

## 11. Acceptance Criteria
- **G**iven an ADMIN **W**hen creating an `APROVADOR NIVEL_2` in `CC-TI-01` **T**hen 201 and the user can authenticate and appears in approver eligibility for that center.
- **G**iven a non-ADMIN **W**hen calling any `/users` mutation **T**hen 403.
- **G**iven an `APROVADOR` user with stale `lockVersion` **W**hen an ADMIN edits them **T**hen 409 with `currentLockVersion`.

## 12. Integration Requirements
`UserDto` shape frozen; `approverLevel`/`costCenterId`/`active` semantics consumed by SPEC-009 (eligibility/inbox), SPEC-015+ (front-end admin).

## 13. Risks
Role edits mid-flight can strand in-progress approvals — acceptable (eligibility is evaluated per action); document in SOLUTION.md trade-offs.

## 14. Definition of Done
AT-04/05 green; role-policy matrix tests green; AI-logged.
