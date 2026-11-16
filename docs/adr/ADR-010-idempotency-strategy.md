# ADR-010 — Idempotency Strategy: Stored-Response Keys Reserved in the Create Transaction

**Status:** Accepted · revised 2026-11-15 to match the Java implementation
**Date:** 2026-11-15

## Context
README §3.2: `POST /requests` with the same `Idempotency-Key`, same user and same payload must return the
same response without creating another request (validity ≥ 24 h); reused key with a different payload →
`409`. The user "can resend the same form twice" (§1) and can retry after a timeout.

## Problem
Guarantee at-most-once creation with exactly-once response semantics across retries and concurrent races.

## Options Considered
1. **Stored-response table** (this ADR): unique (user, key); payload hash + stored response; replay on match.
2. Natural-id dedup (client-generated request UUID as the primary key).
3. Distributed lock around the create, with no stored response.

## Decision
Option 1, table `idempotency_keys` (Flyway `V6`), implemented in `IdempotencyService` with `JdbcClient`:

1. No header → normal create, no dedup.
2. `SELECT` the record for (user, key); a live record with the same hash → **replay** the stored status and
   body; a different hash → `409 IDEMPOTENCY_PAYLOAD_MISMATCH`; an expired record counts as absent.
3. In one transaction (`TransactionTemplate`): reserve the key **first** with
   `INSERT … ON CONFLICT (user_id, idem_key) DO UPDATE … WHERE idempotency_keys.expires_at < now() RETURNING user_id`;
   0 rows → a concurrent request owns the key → roll back, re-read, replay or 409.
4. Create the request in the same transaction, store the serialized response, commit — request row and key row land atomically.

Payload hash = SHA-256 of a canonical form built by the service (fixed field order, trimmed text, prices
normalized to cents, so `"10"` and `"10.00"` are the same payload). Expired rows are deleted by
`IdempotencyPurgeJob` (`@Scheduled`, every `app.idempotency.purge-interval`). A replayed response carries
the header `Idempotent-Replayed: true`.

## Rationale
The race becomes a row count instead of an error: in PostgreSQL a caught unique violation would abort the
transaction and the follow-up read could not run. The conditional `DO UPDATE` is what lets an expired key
be reused (the old row still holds the primary key). The stored response covers "retry after timeout" with
the original 201 body.

## Consequences
- At-most-once creation under racing retries; the integration test checks replay and mismatch.
- Transitions are not idempotency-keyed (FR-024 is a differentiator); a retried transition gets 409
  because its `lockVersion` is stale — the minimal safe behavior.

## Trade-offs
Storage grows with keys until purged; keys are user-scoped (the same key from two users is two records,
matching "do mesmo usuário").

## Related
ADR-008; `database/TRANSACTION-STRATEGY.md` §3.4; A-32.
