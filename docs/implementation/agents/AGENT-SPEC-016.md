# AGENT-SPEC-016 — Frontend Request Management

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Build the requester screens: shareable filtered list, create/edit form with dynamic items and live
display total, and the detail page (items, chain, versions, timeline) with actions rendered strictly
from `allowedActions`.

## Mandatory reading order
1. Repository `README.md` (§2.7) + `AGENTS.md`.
2. `docs/api/openapi.yaml` (request DTOs), `API-DESIGN.md` §4.3/§4.4/§4.6.
3. `docs/architecture/uml/sequence/01-create-request.puml`, `06-resubmit-new-version.puml`.
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-016-frontend-request-management.md`.

## Rules
- Work only in `frontend/src/features/requests/**`.
- Consume SPEC-015 exports only — do not modify `shared/**` (if a primitive is missing, implement a local one and report it).
- AI-log snapshot/record; commit trailers.

## Scope (in)
- List page: server-driven page/size/sort + filters (status/category/costCenterId/date range/amount range/q) reflected in URL via `useSearchParams`; pagination bar; row → detail.
- Form: dynamic item rows (add/remove), live BRL total (display only — Intl.NumberFormat pt-BR), zod mirror validation for UX, server `errors[]` mapped per field, `Idempotency-Key` = one crypto.randomUUID() per form session reused on create retries, `lockVersion` on edit.
- Detail: header data, items table, approval chain (step, level, approver, decidedAt, comment), versions list + per-version view (with items+steps), history timeline, action bar from `allowedActions` (EDIT/SUBMIT/CANCEL here; APPROVE/REJECT/REQUEST_CHANGES render too but are handled by SPEC-017's modal — expose a `renderDecision` slot).
- 409 handling: banner + detail refetch (via SPEC-015 helper).

## Contracts you must not break
- No client-side permission logic (FR-037); no client totals sent to server.

## Validation
- `npm test` green: FT-01 (list URL state + filters), FT-03 (detail renders from mocked DTO incl. allowedActions gating), FT-04 (422 field mapping), FT-05 (409 banner + refetch). ≥3 significant tests satisfy NFR-016 together with SPEC-017.

## Report format
Modified files, test summary, slot contract for SPEC-017, deviations, blockers.
