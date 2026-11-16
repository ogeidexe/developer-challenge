# AGENT-SPEC-011 — Budget Consumption

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement atomic budget consumption on final approval: the conditional UPDATE recipe that makes the
balance never negative under concurrency, with BR-008 zero-balance semantics for missing months.

## Mandatory reading order
1. `README.md` (§2.3 rule 5, §4.2) + `AGENTS.md`.
2. `docs/database/TRANSACTION-STRATEGY.md` §3.2/§4 (the exact recipe and the failure path).
3. `docs/architecture/uml/sequence/07-budget-consumption.puml`, `09-concurrent-budget-consumption.puml`.
4. `docs/api/ERROR-CATALOG.md` (`BUDGET_EXCEEDED` detail contract), `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-011-budget-consumption.md`.

## Rules
- Work only in `backend/src/modules/budgets/**` (consumption service + `BudgetRepository.consume`) — extend the SPEC-005 adapter with a NEW method, do not modify its admin methods.
- The conditional UPDATE is the ONLY writer of `consumed_cents`.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- `BudgetRepository.consume(costCenterId, yearMonth, amountCents): boolean` — raw SQL conditional UPDATE, rowcount contract; missing row ⇒ false.
- `BudgetConsumptionService.consumeOnFinalApproval(request, version)`: resolve version's competence month; throw `DomainError(BUDGET_EXCEEDED)` with center code, month, available, required (Portuguese detail per BR-15/README example).
- Surface for the failure event: rethrow typed error — TransitionService (SPEC-008) handles the event; expose the values it needs.

## Contracts you must not break
- Same-tx semantics (caller provides tx); never catch SQL errors into 500 — map to the domain error.

## Validation
- IT-01 (full flow consumes exactly), IT-03/04 (exceeded + missing month; status unchanged; failure event present), CT-02 (parallel finals: fitting subset wins, losers 422, balance never negative), CT-06 (vs PUT budget).

## Report format
Modified files, test summary, race-test description, deviations, blockers.
