# AGENT-SPEC-014 — Dashboard, Health & Reporting

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement `GET /dashboard/summary` (role-scoped totals + current-month budgets + average approval time
[D]) and complete `GET /health` with a real DB probe.

## Mandatory reading order
1. `README.md` (§2.6) + `AGENTS.md`.
2. `docs/api/openapi.yaml` (`getDashboardSummary`, `getHealth`, `DashboardSummaryDto`, `HealthDto`).
3. `docs/database/ERD-PHYSICAL.md` (`budgets`, partial index), `DATA-DICTIONARY.md`.
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-014-dashboard-health.md`.

## Rules
- Work only in `backend/src/modules/dashboard/**` and the health controller file from SPEC-001 (extend, don't rewrite).
- Reuse `VisibilityPolicy` from SPEC-006 — do not reimplement visibility.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- Totals by status over the caller's visibility scope (requester: own; approver: own CC; admin: all).
- Budgets for the current business month (America/Sao_Paulo): non-ADMIN ⇒ own CC; ADMIN ⇒ all; missing month ⇒ zeros; amount/consumed/available as Money strings.
- `averageApprovalTimeDays`: mean(decided_at − submitted_at) for requests decided (APPROVED/REJECTED) in the last 30 days, in scope; null when empty.
- `/health` 200 `{status, db, timestamp}`; 503 when `SELECT 1` fails.

## Contracts you must not break
- `DashboardSummaryDto`/`HealthDto` frozen; no draft leakage across users in totals.

## Validation
- AT-14 (scope matrix + zero-view + exact budget math + avg metric), AT-17 (200 when up; 503 after stopping the testcontainers PG).

## Report format
Modified files, test summary, deviations, blockers.
