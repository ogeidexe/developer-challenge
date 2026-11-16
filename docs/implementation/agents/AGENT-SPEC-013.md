# AGENT-SPEC-013 — Idempotency & Concurrency Control

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement `Idempotency-Key` handling for `POST /requests` (24 h replay semantics) and the
`LockVersionGuard` that turns stale locks into 409 + `currentLockVersion` on every transition/edit.

## Mandatory reading order
1. `README.md` (§3.2) + `AGENTS.md`.
2. `docs/api/API-DESIGN.md` §6/§7 (recipes), `ERROR-CATALOG.md` (409 rows).
3. `docs/database/TRANSACTION-STRATEGY.md` §3.1/§3.4, `ERD-PHYSICAL.md` §10.
4. `docs/architecture/uml/sequence/10-idempotent-create.puml`, `08-concurrent-same-step-approval.puml`.
5. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-013-idempotency-concurrency.md`.

## Rules
- Work only in `backend/src/modules/idempotency/**` and `backend/src/infrastructure/http/guards/lock-version.guard.ts` (+ module registration).
- Bind the interceptor ONLY to `createRequest` (route-scoped). Never to other endpoints.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- Canonical JSON hasher (sorted keys; numeric normalization) + unit/property tests.
- `IdempotencyStore` (TypeORM) + race-safe recipe per TRANSACTION-STRATEGY §3.4 / API-DESIGN §6:
  SELECT → (replay stored response | mismatch 409 | expired ⇒ absent) → placeholder INSERT **inside the
  create transaction** (first write, `INSERT … ON CONFLICT (user_id, idem_key) DO UPDATE … WHERE expires_at < now() RETURNING`;
  0 rows ⇒ live record ⇒ ROLLBACK, SELECT, replay/409 — never "catch the unique violation", which aborts the PG tx) → UPDATE
  key row with the real response → single COMMIT.
- Lazy purge of expired rows.
- `LockVersionGuard`: required `lockVersion` body field (400 when absent); stale ⇒ 409 with `currentLockVersion` from the aggregate.

## Contracts you must not break
- Stored response replayed verbatim (status + body); response body cap 64 KiB; key length ≤255.

## Validation
- IT-09 (retry ⇒ identical body, one row; different payload ⇒ 409; expired key reusable), CT-05 (parallel same-key creates ⇒ exactly one request), CT-04 (stale-lock 409s with current value), CT-01 (two simultaneous approves ⇒ one 200/one 409).

## Report format
Modified files, test summary, deviations, blockers.
