# AGENT-SPEC-005 — Cost Center & Budget Management

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement cost centers + monthly budgets: `GET/POST /cost-centers`, `GET/PUT …/budgets/:yyyy-mm` with
the `BUDGET_BELOW_CONSUMED` guard under row lock.

## Mandatory reading order
1. `README.md` (§3.1) + `AGENTS.md`.
2. `docs/api/openapi.yaml` (`listCostCenters`, `createCostCenter`, `getBudget`, `setBudget`).
3. `docs/database/ERD-PHYSICAL.md` (`budgets`), `TRANSACTION-STRATEGY.md` (§3 recipes context).
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-005-cost-center-budget-management.md`.

## Rules
- Work only in `backend/src/modules/cost-centers/**` (+ `BudgetRepository` port/adapter if not yet present — coordinate: you own `budgets` reads/writes for admin; SPEC-011 will add the consumption method to the same adapter as a NEW method).
- AI-log snapshot/record; commit trailers.

## Scope (in)
- Center list/create (409 duplicate code).
- Budget GET: zero-balance view for missing month; month format validation (400 `INVALID_MONTH_FORMAT`).
- Budget PUT: upsert inside a tx with `SELECT … FOR UPDATE`; reject amount < consumed with 422 `BUDGET_BELOW_CONSUMED` naming both values.

## Contracts you must not break
- `BudgetDto`/`Money` serialization; no direct `consumed_cents` writes here (only SPEC-011's conditional UPDATE writes consumption).

## Validation
- `npm test` green: AT-15/16; CT-06 (concurrent PUT vs consumption never violates `consumed<=amount` — cooperate with SPEC-011 if it lands later; write the test, skip if consumption absent).

## Report format
Modified files, test summary, deviations, blockers.
