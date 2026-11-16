# AGENT-SPEC-002 — Database & Persistence

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Turn `docs/database/` into a real PostgreSQL 16 schema via TypeORM migrations, the transaction
decorator, the Testcontainers harness, and the README §5.4 seed. You own `backend/src/infrastructure/db/**`.

## Mandatory reading order
1. `README.md` + `AGENTS.md` (rules).
2. `docs/database/ERD-PHYSICAL.md` (authoritative), `migrations/*.sql` (transcribe these), `TRANSACTION-STRATEGY.md`, `DATA-DICTIONARY.md`.
3. `docs/implementation/SHARED-CONTRACTS.md`; `docs/specifications/SPEC-002-database-persistence.md`.

## Rules
- Work only in `backend/src/infrastructure/db/**`, `backend/test/**` (harness part), `backend/package.json` scripts (migration/seed/test), `backend/src/shared/**` ONLY for the `@Transactional` decorator (coordinate via new files).
- AI-log snapshot/record around your turn; commit trailers per SHARED-CONTRACTS §1.

## Scope (in)
- TypeORM data source (env-driven), migrations 001–006 transcribed exactly from `docs/database/migrations/*.sql` (all CHECKs, unique indexes, the status-conditional step-decision guard, and — migration 005 — immutability **triggers** on all three snapshot/audit tables).
- `@Transactional()` decorator + EntityManager propagation (SPEC-002-T05).
- Testcontainers harness: single postgres:16 container per jest run, migrations applied, disposable.
- Seed script (`npm run seed:run`): idempotent **insert-if-absent** (`ON CONFLICT DO NOTHING`; never upsert — migration-005 triggers reject UPDATEs on versions/events, and reruns must not overwrite evaluation data) of the §5.4 fixtures (2 centers — `CC-TI-01` near-exhausted budget, `CC-ADM-02` healthy; per center 1 SOLICITANTE + 1 N1 + 1 N2; 2 global ADMINs; requests in DRAFT / pending N1 / pending N2 / pending ADMIN / CHANGES_REQUESTED / APPROVED-consumed / REJECTED / CANCELLED / one SOFTWARE request; bcrypt-hashed documented passwords). **Accounting rule (A-33):** consumed amounts are backed by seeded APPROVED requests (CC-TI-01's R$49.200 = one APPROVED request; the >R$10.000 flow lives in CC-ADM-02).

## Contracts you must not break
- Column names/types/constraints exactly per ERD-PHYSICAL (other specs and tests assert them).
- Immutability: app role gets no UPDATE/DELETE on `request_events`, `request_versions`, `version_items`.

## Validation
- `npm test` (migration, constraint, seed-idempotency tests green).
- `docker compose up --build` reaches backend listening with schema + seed applied (work with SPEC-001 entrypoint).

## Report format
Modified files, migration list, test summary, deviations, blockers.
