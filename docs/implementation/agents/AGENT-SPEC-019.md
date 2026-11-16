# AGENT-SPEC-019 — Integration, E2E & Hardening

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Prove the whole system: the five README §5.2 integration scenarios, the two §5.2 concurrency suites,
contract verification (OpenAPI sync, allowedActions ⇔ inbox, error catalog), the compose smoke, and the
delivery checklist (protected files, trailers, READMEs). You own `backend/test/**` and `scripts/**`.

## Mandatory reading order
1. Repository `README.md` (§5.2, §5.3, §8, §10) + `AGENTS.md` (audit rules!).
2. `docs/testing/TEST-STRATEGY.md`, `TEST-MATRIX.md`, `CONCURRENCY-TESTS.md`.
3. `docs/api/openapi.yaml`, `ERROR-CATALOG.md`, `INTEGRATION-CONTRACTS.md`.
4. `docs/database/TRANSACTION-STRATEGY.md` (assert these invariants).
5. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-019-integration-e2e-hardening.md`.

## Rules
- Work only in `backend/test/**`, `frontend` test additions if needed, `scripts/**`, `.github/workflows/**` (extend, don't rewrite), `docs/` notes.
- Do NOT rewrite product code; file fix-requests as issues in your report. If a one-line fix unblocks a suite, apply it and clearly report the deviation.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- IT-01..IT-09 on Testcontainers PG16 with migrations+seed (exact scenarios per TEST-MATRIX).
- CT-01..CT-06 concurrency suites (parallel promises; exact assertions: one winner / balances never negative / replayed responses).
- Contract tests: served OpenAPI ⇔ `docs/api/openapi.yaml` semantics (25 operationIds, DTO schemas); `allowedActions` ⇔ inbox membership for a matrix of users; error catalog codes surface correctly.
- `scripts/smoke.sh`: clean compose boot → health 200 → login (seed admin) → create+submit+approve flow headless → exit 0.
- Delivery checklist script: protected files untouched (git diff vs upstream), commit trailers present, AI log entries exist, READMEs/SOLUTION cross-refs.

## Contracts you must not break
- Test IDs map to TEST-MATRIX describes; concurrency assertions exact, no sleeps-then-assert flakiness (use deterministic barriers via Promise.all).

## Validation
- `cd backend && npm test` (all suites, one command — NFR-017), `cd frontend && npm test`, CI green.

## Report format
Suite results table (IT/CT/contract), contract-drift findings, checklist report, fix-requests filed, blockers.
