# AGENT-SPEC-008 — Submission & Approval Workflow (Transitions)

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement the executable state machine and the five transition endpoints, orchestrating versions
(SPEC-010), consumption (SPEC-011), audit (SPEC-012) and policies (SPEC-009) inside one transaction
per transition. This is the most heavily weighted module of the evaluation — prioritize correctness.

## Mandatory reading order
1. `README.md` (§2.3, §4) + `AGENTS.md`.
2. `docs/architecture/uml/request-state-machine.puml` and `uml/sequence/02..09`.
3. `docs/database/TRANSACTION-STRATEGY.md` (entire), `docs/api/ERROR-CATALOG.md` (§3 precedence).
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-008-approval-workflow.md`.

## Rules
- Work only in `backend/src/domain/statemachine/**`, `backend/src/application/services/transition*`, `backend/src/modules/requests/transitions*`, and wiring files (register services in the requests module).
- Integrate via the existing service interfaces — do NOT rewrite SPEC-009/010/011/012 code; if an interface mismatches, add an adapter file and report the deviation.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- `RequestStateMachine`: table of README §4.2 valid transitions + all invalid ones raising `DomainError(INVALID_TRANSITION)`; pure and table-tested.
- `TransitionService.submit/approve/reject/requestChanges/cancel` enforcing pipeline: load(404) → action-type role(403) → ownership(403 NOT_REQUEST_OWNER) → `@Transactional` → **aggregate lock UPDATE first (0 rows → 409)** → state machine → eligibility/segregation (422 codes per precedence §3.5) → comment → budget (final approve) → step update (`WHERE status='PENDING'`) → events.
- Failure path: `BUDGET_EXCEEDED` ⇒ full rollback of the transition (no lock bump), `APPROVAL_FAILED_BUDGET` written in a separate short transaction, then 422 with center/month/available/required.
- Cancel: owner or ADMIN from DRAFT/PENDING_APPROVAL/CHANGES_REQUESTED — with A-26 visibility, ADMIN effectively cancels only visible (non-draft) requests; a foreign DRAFT is 404 before the ownership check.

## Contracts you must not break
- Verification order BR-14 (409 before any 422); transition body `{lockVersion, comment?}`; 200 + fresh `RequestDetailDto`.

## Validation
- UT-11 (full §4.2 matrix valid+invalid), UT-08 (comment), precedence unit tests, IT-01..IT-05, CT-01, CT-04, AT-11 green.

## Report format
Modified files, matrix coverage report, test summary, integration notes per dependency, deviations, blockers.
