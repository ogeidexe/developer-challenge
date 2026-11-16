# AGENT-SPEC-017 — Frontend Approval Inbox & Actions

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Build the approver experience: the inbox work queue (current step shown), decision modals with the
mandatory-comment rule, and the graded 409/422 conflict UX.

## Mandatory reading order
1. Repository `README.md` (§2.4, §2.7) + `AGENTS.md`.
2. `docs/api/openapi.yaml` (`getApprovalInbox`, `InboxItemDto`, transition operations).
3. `docs/api/ERROR-CATALOG.md` §4, `docs/architecture/uml/sequence/08-concurrent-same-step-approval.puml`.
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-017-frontend-approval-inbox.md`.

## Rules
- Work only in `frontend/src/features/approvals/**`; reuse SPEC-016 detail pages via its `renderDecision` slot (coordinate through that slot only).
- AI-log snapshot/record; commit trailers.

## Scope (in)
- Inbox screen: paginated list from `getApprovalInbox` with current-step badge (level + sequence), cost-center column, submitter, total; empty state ("Nenhuma solicitação aguardando sua aprovação"); invalidate on decision.
- Decision modal: used for APPROVE (comment optional), REJECT and REQUEST_CHANGES (comment required, client hint ≥10 chars, server authoritative); disable double-submit; on 422 keep comment + show `detail`; on 409 show conflict banner and refetch detail+inbox.
- After success: navigate/refresh to the updated detail; show toast with the new status.

## Contracts you must not break
- Buttons only from `allowedActions` (FR_037); server detail shown verbatim on 422 (BR-15 UX).

## Validation
- `npm test` green: FT-02 (actions rendered from allowedActions — the significant test), FT-04 (modal blocks <10 chars and submits reject correctly), FT-05 (409 → banner + refetch), 422 detail display.

## Report format
Modified files, test summary, deviations, blockers.
