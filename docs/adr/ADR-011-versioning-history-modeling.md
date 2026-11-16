# ADR-011 — Versioning & History Modeling: Working Copy + Frozen Snapshots + Append-Only Events

**Status:** Accepted (mandated by README §5.5: versioning/history ADR)
**Date:** 2026-11-15

## Context
README §2.3.6: returning a request for adjustment creates `CHANGES_REQUESTED`; the owner edits and
resubmits, creating a new version (v2, v3…); the previous version stays **immutable and queryable**;
the chain is recalculated from zero. §2.3.5: the competence month is the submission month of the current
version (America/Sao_Paulo) and changes if resubmitted in another month. §2.5: every action emits an
append-only event.

## Problem
Model versions, snapshots and audit so immutability is structural (not a convention) and competence is
deterministic.

## Options Considered
1. **Mutable version rows** with a `superseded` flag + history reconstructed from events.
2. **Working copy on the request + frozen snapshot per submission** (`request_versions` + `version_items`
   + `approval_steps` per version), with `current_version` as a pointer; separate `request_events` table.
3. Full event-sourcing (state derived by replaying events).

## Decision
Option 2. The request row holds the editable working copy (title/description/category/neededBy/items
and costCenterId); `submit` freezes an immutable snapshot (version n, competence month stamped at that
instant, **frozen `cost_center_id`**, chain built for that version). Resubmission inserts n+1; prior rows
are never updated — no update path in code, and a `BEFORE UPDATE OR DELETE` trigger on
`request_versions`/`version_items`/`request_events` (migration 005) enforces it at the DB level even
for the owning role. History is a separate append-only stream with redundant context (actor role,
statuses, step, version) so the timeline stays meaningful without joining mutable reference data.
Option 1 violates immutability-by-construction; option 3 is unjustified complexity for a 7-day scope.

Two modeling details decided with it:
- **The version snapshot carries the cost center.** Budget consumption charges the version's frozen
  center, so editing `costCenterId` in `CHANGES_REQUESTED` can never re-attribute a past version's
  spend — otherwise v1's history (approved under CC-A, billed to CC-B) would contradict README §2.3.6.
- **Steps record outcomes, not just approvals** (statuses PENDING/APPROVED/REJECTED/RETURNED/CANCELLED/SKIPPED): the detail
  view must show the truthful chain (§2.7) — a rejected, returned or cancelled request whose steps still
  read PENDING would misrepresent it. The deciding step gets the outcome; every later step of that version
  becomes SKIPPED in the same transaction, so a closed version never has a PENDING step (A-31).

## Rationale
Freezing at submit gives the audit property directly ("a versão anterior fica imutável e consultável"),
makes chain recalculation trivially correct (new steps reference only the new version), and keeps reads
simple (current state = working copy + current version's steps). Stamping `competence_month` at freeze
time makes consumption deterministic and replayable — it binds the budget to the month the business saw
at submission, which is exactly BR-007's intent (a resubmission in another month re-stamps on the new version).

## Consequences
- Draft editing mutates only the working copy; submitted versions never change (IT-05 proves it).
- Events are cheap to write (single insert per action) and impossible to amend (revoke + trigger; IT-06).
- Storage: items exist twice (working + frozen) — negligible at challenge scale.

## Trade-offs
Reconstructing "what the working copy looked like" mid-review requires reading the latest snapshot, not
the working copy — acceptable since after submit both are identical until a return-for-adjustment.

## Implementation
`TransitionService.submit` freezes `RequestVersionEntity` + `VersionItemEntity` and builds the steps;
the version entities and `RequestEventEntity` are Hibernate `@Immutable`, and Flyway `V5` adds the
immutability triggers. `AuditService` writes every event (with `X-Request-Id` from the MDC).
`RequestMapper.detail` shows the working copy while the request is editable and the frozen version
otherwise; `GET /requests/{id}/versions[/{n}]` serve the snapshots.

## Related Specifications
SPEC-006, SPEC-010, SPEC-012; BR-007/BR-010/BR-011; DATA-003/DATA-004.
