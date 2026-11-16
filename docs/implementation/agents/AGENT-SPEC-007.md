# AGENT-SPEC-007 — Request Items & Monetary Calculation (addendum prompt)

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
SPEC-007 (Money value object + item calculation) is executed by the same agent and in the same wave as
SPEC-006 because both own the same files (`backend/src/domain/money/**` and the request item DTOs).
This document is the dedicated prompt for SPEC-007 so every specification has its own agent brief; the
executing agent follows **AGENT-SPEC-006.md** for process and reads both specs.

## Mandatory reading
1. `docs/specifications/SPEC-007-request-items-monetary-calculation.md` (scope, rules, acceptance).
2. `AGENT-SPEC-006.md` (process, rules, contracts, validation commands).
3. `docs/adr/ADR-005-money-representation.md`.

## Scope (summary)
- `Money` value object (bigint cents, BRL-only; `plus/times/isGreaterThan/toDecimalString`; parse/format).
- `MoneyCalculator.total(items)` — per-item `quantity × unitPrice`, summed; exact integer math.
- Validation bounds: unitPrice > 0, ≤ 13 integer digits, ≤ 2 fraction digits; quantity 1..1 000 000; 1..50 items.
- Property-based round-trip tests + boundary table tests (UT-02/UT-20).
- Wire into SPEC-006 create/update; serialization per `Money` schema in `openapi.yaml`.
- Client-sent totals are ignored everywhere (assert in AT-06/AT-07).

## Validation
- `cd backend && npm test` — UT-02/UT-20 and money-related AT assertions green.

## Report format
Per AGENT-SPEC-006, with an explicit "SPEC-007 deliverables" section listing the Money API surface.
