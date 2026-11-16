# AGENT-SPEC-012 — Audit Trail & History

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement the append-only event model, emission helper, and `GET /requests/:id/history`, covering every
lifecycle action including the budget-failure event.

## Mandatory reading order
1. `README.md` (§2.5) + `AGENTS.md`.
2. `docs/database/DATA-DICTIONARY.md` (`request_events`), `ERD-PHYSICAL.md` §9.
3. `docs/api/openapi.yaml` (`getRequestHistory`, `RequestEventDto`).
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-012-audit-trail-history.md`.

## Rules
- Work only in `backend/src/modules/audit/**` (service, repository port/adapter, controller wiring for history route — register under the requests module routes as a new file).
- Actor context comes from `@CurrentUser()`; `xRequestId` from the request-scoped context (SPEC-001 middleware).
- AI-log snapshot/record; commit trailers.

## Scope (in)
- Event factory + `AuditLogService.record(...)`/`history(requestId)`.
- Emission helper used by create/edit (SPEC-006 hooks — provide the interface; coordinate) and all transitions (`SUBMITTED`, `RESUBMITTED`, `APPROVED`, `APPROVAL_FAILED_BUDGET` with `to_status=PENDING_APPROVAL`, `REJECTED`, `CHANGES_REQUESTED`, `CANCELLED`, `REQUEST_CREATED`, `EDITED`).
- History endpoint: ascending (occurred_at, id); visibility = request visibility (404 otherwise).

## Contracts you must not break
- Action names are a public contract (timeline UI); UTC timestamps; append-only (no update/delete code paths — DB enforces).

## Validation
- IT-06 lifecycle event-list assertions (order, statuses, versions, step context, xRequestId match), immutability test (UPDATE/DELETE denied), AT-13 green.

## Report format
Modified files, event inventory vs spec, test summary, deviations, blockers.
