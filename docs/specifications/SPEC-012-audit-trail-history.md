# SPEC-012 — Audit Trail & History

## 1. Specification Metadata
- **ID:** SPEC-012 · **Feature:** Append-only events + history endpoint · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (3–5 h) · **Dependencies:** SPEC-006, SPEC-008 (event emission points) · **Wave:** 3
- **Responsible agent:** AGENT-SPEC-012 · **Status:** implemented — drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
Internal audit requires full traceability: who did what, when, on which version, with which correlation
id (README §2.5). Events are append-only — never altered, never deleted — hardened at the database.

## 3. Scope
**In:** `AuditLogService.record` + `history`; event model (actor, role, action, from/to status, step
level/sequence, version, comment, `xRequestId`, UTC `occurredAt`); `GET /requests/:id/history`.
**Out:** event consumption for dashboards beyond what SPEC-014 needs (read access is open).

## 4. Requirements
FR-026 · FR-027 · FR-060 · BR-011 · DATA-004 · NFR-005 · NFR-007

## 5. Business Rules
- Every action in the lifecycle emits exactly one event inside the same tx: `REQUEST_CREATED`, `EDITED`,
  `SUBMITTED`, `RESUBMITTED`, `APPROVED`, `APPROVAL_FAILED_BUDGET`, `REJECTED`, `CHANGES_REQUESTED`, `CANCELLED`.
- `APPROVAL_FAILED_BUDGET` carries `to_status=PENDING_APPROVAL` (no state change occurred).
- Actor context comes from the security principal (never from the request body); system actions use NULL actor.
- History is read-ascending by (occurred_at, id) — stable timeline.

## 6. Architecture (as implemented)
`application.AuditService.record` (`Propagation.MANDATORY`) inserts `RequestEventEntity` (`@Immutable`) with actor, role, statuses, step, version, comment, UTC time and the `X-Request-Id` from the MDC (`config.RequestContext`); `recordBudgetFailure` uses `REQUIRES_NEW`. Emission points: `PurchaseRequestService` (created, edited) and `TransitionService` (submitted/resubmitted, approved, rejected, changes requested, cancelled). History: `RequestQueryService.history` (ordered by time, id).

## 7. API Contract
Operation `getRequestHistory` → `RequestEventDto[]` (ascending). Errors: 401, 404 (visibility).

## 8. Database Impact
Table `request_events` (insert-only; revokes + trigger from SPEC-002 migration 005).

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Event factory (typed actions) + mapper | domain object | unit |
| T02 `EventRepository.append` + `listFor` | persistence | IT-06 |
| T03 Emission wiring in create/edit/transitions (incl. failure event) | coverage | IT-01..05 |
| T04 History endpoint | API | AT-13 |
| T05 Immutability proof test | DB denies UPDATE/DELETE | IT-06 |

## 10. Testing Strategy
Integration: full lifecycle produces the exact ordered event list with correct statuses/versions/steps;
event on failed budget; `xRequestId` equals the request header; direct UPDATE/DELETE attempt throws.

## 11. Acceptance Criteria
- **G**iven a create→submit→approve(N1)→return→edit→resubmit→approve→approve(ADMIN) lifecycle **W**hen reading history **T**then events appear in order with correct `version_number` (1 then 2) and `from/to` statuses.
- **G**iven any SQL client with app credentials **W**hen attempting `DELETE FROM request_events` **T**hen permission denied.

## 12. Integration Requirements
Event action names are a public contract (timeline UI in SPEC-016); SPEC-014 may read events for the avg-approval-time [D] metric.

## 13. Risks
Forgetting an emission point — mitigate with a single `AuditLogService.recordAction(...)` helper and checklist in code review.

## 14. Definition of Done
IT-06 + lifecycle integration tests green; immutability verified; AI-logged.
