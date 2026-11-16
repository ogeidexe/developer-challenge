# SPEC-010 — Request Versioning

## 1. Specification Metadata
- **ID:** SPEC-010 · **Feature:** Frozen versions + version endpoints · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (4–5 h) · **Dependencies:** SPEC-006, SPEC-008 (submit hook) · **Wave:** 3
- **Responsible agent:** AGENT-SPEC-010 · **Status:** implemented — drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
Resubmission creates v2, v3… while v1 stays immutable and queryable (README §2.3.6); competence month is
stamped per version (BR-007). Powers `GET /requests/:id/versions(/:n)` and the detail's version list.

## 3. Scope
**In:** `RequestVersioningService.freezeForSubmit` (snapshot copy + steps build via SPEC-009 builder +
competence stamp via `BusinessCalendar`); version mappers; `GET /requests/:id/versions`,
`GET /requests/:id/versions/:n` (with items + steps).
**Out:** transitions (SPEC-008 calls this service); audit events (SPEC-012).

## 4. Requirements
FR-022 · FR-054 · BR-007 · BR-010 · DATA-003 · NFR-005

## 5. Business Rules
- Version numbers are 1-based, monotonic per request; `current_version` increments only inside the submit tx.
- The snapshot includes the **frozen `cost_center_id`** (A-28): budget consumption charges the version's center, so a working-copy CC change in `CHANGES_REQUESTED` can never re-attribute a past version.
- Snapshot rows (`request_versions`, `version_items`) are never updated — no code path; DB trigger (SPEC-002 migration 005).
- Resubmission freezes a **new** snapshot from the working copy, rebuilds the chain from zero, and does not carry prior approvals.
- Competence month = month of submission in America/Sao_Paulo (A-08); stored, never re-derived later.

## 6. Architecture (as implemented)
No separate versioning service: `TransitionService.submit` freezes `RequestVersionEntity` (frozen cost center, total, `competence_month` from `domain.BusinessCalendar`) + `VersionItemEntity`, then builds the steps. Versions are `@Immutable` and trigger-protected. `RequestQueryService.versions/version` + `RequestMapper.versions` serve `GET /requests/{id}/versions[/{n}]`.

## 7. API Contract
Operations `listRequestVersions`, `getRequestVersion` → `RequestVersionDto[]` / `RequestVersionDto`
(incl. `items[]` and `steps[]`). Errors: 401, 404 (invisible request or missing version number).

## 8. Database Impact
Tables `request_versions`, `version_items`, `approval_steps` (inserts only). No schema change.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 `BusinessCalendar` + competence tests (month edges in São Paulo tz) | calendar | UT-09 |
| T02 `freezeForSubmit` (copy + stamp + steps via builder) | service | unit |
| T03 `VersionRepository` + mappers | persistence | IT-05 |
| T04 versions endpoints | API | AT-13 |
| T05 immutability integration test (direct UPDATE attempt fails) | DB proof | IT-06 |

## 10. Testing Strategy
Unit: competence month derivation at 23:59/00:01 local across month boundaries. Integration: submit →
return → edit → resubmit ⇒ v1 byte-identical (fields + items), v2 exists with recalculated chain; v1
approvals absent from v2 steps; UPDATE on request_versions rejected by DB.

## 11. Acceptance Criteria
- **G**iven v1 submitted 2026-10-31 23:55 America/Sao_Paulo (UTC 2026-11-01) **W**hen frozen **T**then competence_month = "2026-10" (business tz wins).
- **G**iven a resubmitted request **W**hen reading v1 **T**then its items/total equal the original submission exactly.

## 12. Integration Requirements
`RequestVersionDto` frozen for SPEC-016 detail UI; `freezeForSubmit` is only called by `TransitionService.submit`.

## 13. Risks
Timezone bugs in competence month — mitigated by injected clock + edge tests.

## 14. Definition of Done
UT-09, IT-05, IT-06, AT-13 green; immutability verified at DB level; AI-logged.
