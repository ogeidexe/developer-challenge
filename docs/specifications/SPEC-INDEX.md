# Specification Index

> 19 feature packages. They were written as briefs for parallel AI implementation (prompts in
> `docs/implementation/agents/`, waves in `docs/implementation/DEPENDENCY-GRAPH.md` — historical).
> Each spec now states its real implementation status and its as-built architecture (§6).
> Back end = drafted in `backend/`, **not yet compiled**; front end = runs, covered by Cypress.

| ID | Feature | Priority | Complexity | Depends on | Wave | Agent prompt (historical) | State |
|---|---|---|---|---|---|---|---|
| SPEC-001 | Project Foundation & Infrastructure | P0 | M | — | 0 | AGENT-SPEC-001.md | partial (compose, CI missing) |
| SPEC-002 | Database & Persistence (migrations + seed) | P0 | M | SPEC-001 | 1 | AGENT-SPEC-002.md | back end drafted |
| SPEC-003 | Authentication & Authorization | P0 | M | SPEC-001, 002 | 1 | AGENT-SPEC-003.md | back end drafted |
| SPEC-004 | User & Role Management | P1 | S | SPEC-003 | 2 | AGENT-SPEC-004.md | back end drafted |
| SPEC-005 | Cost Center & Budget Management | P1 | S | SPEC-003 | 2 | AGENT-SPEC-005.md | back end drafted |
| SPEC-006 | Purchase Request Core (CRUD · list · detail) | P0 | L | SPEC-003, 002 | 2 | AGENT-SPEC-006.md | back end drafted · UI done |
| SPEC-007 | Request Items & Monetary Calculation | P0 | S | SPEC-006 | 2 | AGENT-SPEC-006.md (shared agent wave) — see note | back end drafted |
| SPEC-008 | Submission & Approval Workflow (transitions) | P0 | L | SPEC-006, 007, 009 | 3 | AGENT-SPEC-008.md | back end drafted |
| SPEC-009 | Approval Rules, Eligibility & Inbox | P0 | M | SPEC-006 | 3 (start) / 2 (domain part) | AGENT-SPEC-009.md | back end drafted · UI done |
| SPEC-010 | Request Versioning | P0 | M | SPEC-006, 008 | 3 | AGENT-SPEC-010.md | back end drafted |
| SPEC-011 | Budget Consumption | P0 | M | SPEC-005, 008 | 3 | AGENT-SPEC-011.md | back end drafted |
| SPEC-012 | Audit Trail & History | P0 | M | SPEC-006, 008 | 3 | AGENT-SPEC-012.md | back end drafted |
| SPEC-013 | Idempotency & Concurrency Control | P0 | M | SPEC-006, 008 | 3 | AGENT-SPEC-013.md | back end drafted (CT-05/06 missing) |
| SPEC-014 | Dashboard, Health & Reporting | P1 | S | SPEC-006, 005, 012 | 4 | AGENT-SPEC-014.md | back end drafted · UI done |
| SPEC-015 | Frontend Foundation | P0 | M | SPEC-001 (API contract) | 1 (parallel) | AGENT-SPEC-015.md | done |
| SPEC-016 | Frontend Request Management | P0 | L | SPEC-015, 006 | 4 | AGENT-SPEC-016.md | done |
| SPEC-017 | Frontend Approval Inbox & Actions | P0 | M | SPEC-015, 008, 009 | 4 | AGENT-SPEC-017.md | done |
| SPEC-018 | Frontend Administration | P2 (differentiator-adjacent; screens optional per README §2.7) | S | SPEC-015, 004, 005 | 5 | AGENT-SPEC-018.md | done |
| SPEC-019 | Integration, E2E & Hardening | P0 | L | all backend specs | 5–6 | AGENT-SPEC-019.md | partial (tests written; compose, CI, contract test missing) |

**Note on SPEC-007:** it is small and shares files with SPEC-006 (`Money`, item DTOs, calculation service);
both are assigned to the same agent execution in Wave 2 to avoid merge conflicts — see DEPENDENCY-GRAPH.md.

## Reading order

1. `docs/README.md` (status + map) → 2. `REQUIREMENTS.md` → 3. `architecture/OVERVIEW.md` →
4. `database/ERD-PHYSICAL.md` → 5. `api/API-DESIGN.md` + `openapi.yaml` → 6. the relevant `SPEC-0NN` (§6 = as built).

## Coverage guarantee

Every mandatory FR/BR/NFR/SEC/DATA requirement maps to ≥ 1 spec (TRACEABILITY-MATRIX.md §1). No requirement is left orphaned.
