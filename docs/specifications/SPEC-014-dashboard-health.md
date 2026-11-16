# SPEC-014 — Dashboard, Health & Reporting

## 1. Specification Metadata
- **ID:** SPEC-014 · **Feature:** Dashboard summary + health + average-approval-time [D] · **Version:** 1.0
- **Priority:** P1 · **Complexity:** S (3–4 h) · **Dependencies:** SPEC-006, SPEC-005, SPEC-012 (events for [D]) · **Wave:** 4
- **Responsible agent:** AGENT-SPEC-014 · **Status:** implemented — drafted in `backend/` — not yet compiled or run; UI implemented in `frontend/` — runs, covered by Cypress

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
Two mandatory reads (README §2.6): totals by status within role scope, and current-month budget per cost
center (budgeted/consumed/available). Plus `GET /health` (with DB check) and the optional average
approval-time metric (§6 differentiator — cheap here because events exist).

## 3. Scope
**In:** `GET /dashboard/summary` (scope: own / cost-center / all; budgets: own CC for non-ADMIN, all for
ADMIN — A-12); `GET /health` (app + DB); `averageApprovalTimeDays` (last 30 days, submissions → final
decision, scoped) — [D] but included.
**Out:** exports, charts backend, other aggregations.

## 4. Requirements
FR-028 · FR-029 · FR-030 [D] · FR-062 · FR-063 · INF-005 · NFR-020

## 5. Business Rules
- Totals reflect the same visibility predicate as the list (no draft leakage across users).
- Budgets use the current business month (America/Sao_Paulo); missing month ⇒ zeros (BR-08 consistent).
- `averageApprovalTimeDays` averages (decided_at − **first submission instant**) over requests decided
  (APPROVED/REJECTED) in the last 30 days, in scope; the first submission is the earliest `SUBMITTED`/`RESUBMITTED`
  event of the request (events are authoritative — `submitted_at` alone would skew resubmitted requests, A-29);
  null when no data.

## 6. Architecture (as implemented)
`application.DashboardService` runs three independent reads in parallel on virtual threads: counts per status (all statuses, incl. zero) over `RequestSpecifications.visibleTo`; current-month budgets (ADMIN all centers, others their own; missing month = zeros); average days from first submission to decision over the last 30 days (A-29). Health: Spring Boot Actuator at `/health` (DB component included; 503 when down) — no custom controller.

## 7. API Contract
Operations `getDashboardSummary` (200 `DashboardSummaryDto`) and `getHealth` (200 `HealthDto`; 503 when
DB down) — exactly per `openapi.yaml`.

## 8. Database Impact
Read-only.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Scoped totals query (+draft visibility rules) | service | AT-14 |
| T02 Current-month budgets query (zero view) | service | AT-14 |
| T03 Average approval time from events | metric | AT-14 |
| T04 Health endpoint with DB probe | endpoint | AT-17 |
| T05 Dashboard controller + DTOs | API | AT-14 |

## 10. Testing Strategy
Unit: scope mapping. Integration: requester sees own totals only; approver sees CC totals; ADMIN sees
all; budget math exact (amount−consumed); health flips to 503 when DB stops (testcontainers stop).

## 11. Acceptance Criteria
- **G**iven, in the requester's cost center, 3 drafts (2 owned by the requester, 1 by a colleague) and 4
  `PENDING_APPROVAL` requests (1 owned by the requester, 3 by colleagues), plus 5 requests in another center
  **W**hen the requester fetches the dashboard **T**hen totals are exactly `DRAFT=2`, `PENDING_APPROVAL=1`
  (a `SOLICITANTE` counts **only own** requests — README §2.6), and no other center's data appears.
- **G**iven the same data **W**hen the center's `APROVADOR` (owner of none of them) fetches the dashboard
  **T**hen totals are `DRAFT=0` (drafts are owner-only, A-26) and `PENDING_APPROVAL=4`.
- **G**iven the DB container is stopped **W**hen GET /health **T**then 503 with `db: DOWN`.

## 12. Integration Requirements
Reuses `VisibilityPolicy` (SPEC-006) — same predicate; `Money` serialization (SPEC-007).

## 13. Risks
Metric denominator subtleties (only final decisions; decided in window) — covered by table tests.

## 14. Definition of Done
AT-14/AT-17 green; visibility predicate shared, not reimplemented; AI-logged.
