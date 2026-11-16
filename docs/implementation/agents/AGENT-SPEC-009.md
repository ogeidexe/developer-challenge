# AGENT-SPEC-009 — Approval Rules, Eligibility & Inbox

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Implement the pure rule engine (chain builder, eligibility, segregation) and the approval inbox query.
Your pure policies are the single source of truth reused by transitions and `allowedActions`.

## Mandatory reading order
1. `README.md` (§2.3, §2.4) + `AGENTS.md`.
2. `docs/architecture/uml/class-diagram.puml` (domain services), `sequence/03-approve-request.puml`.
3. `docs/api/openapi.yaml` (`getApprovalInbox`, `InboxItemDto`), `ERROR-CATALOG.md`.
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-009-approval-rules-inbox.md`.

## Rules
- Work only in `backend/src/domain/approval/**` and `backend/src/modules/approvals/**`.
- The domain part has ZERO framework/ORM imports (NFR-004) — enforce via your own lint checks.
- AI-log snapshot/record; commit trailers.

## Scope (in)
- `ApprovalChainBuilder.build(totalCents, category)` per BR-004/BR-005 (cents thresholds; SOFTWARE appends ADMIN; never duplicated).
- `ApproverEligibilityPolicy.isEligible(principal, request, step)` per FR-016 (N1←N1|N2 same CC or ADMIN; N2←N2 same CC or ADMIN; ADMIN←ADMIN; ADMIN not CC-restricted).
- `SegregationOfDutiesPolicy`: owner → `SELF_APPROVAL_FORBIDDEN`; any approval by same user in the version → `DUPLICATE_APPROVER` (per version!).
- `GET /approvals/inbox`: current-step predicate in SQL over `ix_req_pending`; excludes the caller's own requests and **versions in which the caller already approved a step**; CC scope for non-ADMIN; ADMIN sees every actionable request (inbox holds only PENDING_APPROVAL — no drafts exist here by construction); paginated; 403 for SOLICITANTE.

## Contracts you must not break
- Policy signatures feed SPEC-008 and SPEC-006 — coordinate: expose `ApprovalRulesFacade` (pure) consumed by both.
- Inbox results must be consistent with what transitions would allow (SPEC-019 asserts this).

## Validation
- UT-04/05/06/07/10 (boundaries at exactly 100000/100001/1000000/1000001; SOFTWARE variants; eligibility matrix; segregation incl. per-version reset), AT-12 green.

## Report format
Modified files, matrix coverage, test summary, deviations, blockers.
