# AGENT-SPEC-010 — Request Versioning

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement immutable version snapshots and the version endpoints, with competence-month stamping
(America/Sao_Paulo) at submit.

## Mandatory reading order
1. `README.md` (§2.3 rule 6, §2.3 rule 5) + `AGENTS.md`.
2. `docs/architecture/uml/sequence/06-resubmit-new-version.puml`.
3. `docs/database/ERD-PHYSICAL.md` (`request_versions`, `version_items`), `DATA-DICTIONARY.md`.
4. `docs/api/openapi.yaml` (`listRequestVersions`, `getRequestVersion`), `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-010-request-versioning.md`.

## Rules
- Work only in `backend/src/modules/requests/versions/**`, `backend/src/application/services/versioning*`, `backend/src/domain/request/version*`, `backend/src/infrastructure/calendar/**`.
- `freezeForSubmit` is called only by `TransitionService.submit` — expose the service, never a controller.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- `BusinessCalendar` port + `SystemBusinessCalendar` (injectable; `competenceMonth(instant)` in São Paulo tz) + tests at month edges.
- `RequestVersioningService.freezeForSubmit(request)`: copy working copy → `request_versions`(n=current+1) + `version_items`; stamp competence; build steps via SPEC-009's chain builder; insert steps; bump `current_version` (the aggregate update is owned by TransitionService — coordinate so both happen in the same tx).
- `GET /requests/:id/versions` and `/versions/:n` (items + steps per version; 404 when request invisible or n missing).

## Contracts you must not break
- Snapshot immutability (no update path; DB revokes already in place); `RequestVersionDto` frozen.

## Validation
- UT-09, IT-05 (v1 preserved byte-identical after v2; chain recalculated; v1 approvals absent from v2), IT-06 (direct UPDATE on request_versions rejected), AT-13 green.

## Report format
Modified files, test summary, tx-coordination note with SPEC-008, deviations, blockers.
