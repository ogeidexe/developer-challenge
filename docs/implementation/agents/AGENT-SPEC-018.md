# AGENT-SPEC-018 — Frontend Administration

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
(Optional, P2) Minimal ADMIN UI: users, cost centers, monthly budgets — so the demo can manage data
without curl. Skip gracefully if time-constrained; the API is the contract.

## Mandatory reading order
1. Repository `README.md` (§2.7 last bullet, §6) + `AGENTS.md`.
2. `docs/api/openapi.yaml` (users/cost-centers/budgets operations).
3. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-018-frontend-administration.md`.

## Rules
- Work only in `frontend/src/features/admin/**`; reuse SPEC-015 primitives.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- Users: list (filters role/q), create (role/level conditional fields), edit (role/level/center/active).
- Cost centers: list/create.
- Budgets: month picker (`yyyy-mm`), amount form showing current consumed, inline 422 `BUDGET_BELOW_CONSUMED` detail.

## Contracts you must not break
- Admin area hidden for non-ADMIN (guards mirror server 403).

## Validation
- FT-06 green (budget editor error surface; user form role/level conditionality).

## Report format
Modified files, test summary, deviations, blockers (or "waived by coordinator").
