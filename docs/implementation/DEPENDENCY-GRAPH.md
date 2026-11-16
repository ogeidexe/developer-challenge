# Dependency Graph & Implementation Waves

> **Historical planning record.** Written before implementation to coordinate parallel AI agents on the
> originally planned stack (NestJS + TypeORM, React + react-hook-form + zod). The project was then built
> with Spring Boot 4.1 (Java 25) and React + Ant Design — see `docs/README.md` (status) and ADR-002.
> Kept for traceability; it does not describe the current code.

> Directed acyclic graph of the 19 specifications. Wave 0 starts immediately; each wave's exit criteria
> gate the next. Parallelizable specs share no files by construction (see SHARED-CONTRACTS §11).

```mermaid
flowchart TD
    S001[SPEC-001 Foundation]
    S002[SPEC-002 Database + Seed]
    S003[SPEC-003 Auth]
    S015[SPEC-015 FE Foundation]
    S004[SPEC-004 Users admin]
    S005[SPEC-005 Centers + Budgets]
    S006[SPEC-006 Request core]
    S007[SPEC-007 Money/Items]
    S009[SPEC-009 Rules + Inbox]
    S010[SPEC-010 Versioning]
    S011[SPEC-011 Budget consumption]
    S012[SPEC-012 Audit]
    S013[SPEC-013 Idempotency + Locks]
    S008[SPEC-008 Transitions]
    S014[SPEC-014 Dashboard]
    S016[SPEC-016 FE Requests]
    S017[SPEC-017 FE Inbox]
    S018[SPEC-018 FE Admin]
    S019[SPEC-019 Integration + Hardening]

    S001 --> S002
    S001 --> S015
    S002 --> S003
    S003 --> S004
    S003 --> S005
    S003 --> S006
    S006 --> S007
    S006 --> S009
    S006 --> S010
    S006 --> S013
    S007 --> S008
    S009 --> S008
    S010 --> S008
    S011 --> S008
    S012 --> S008
    S005 --> S011
    S013 --> S008
    S008 --> S014
    S012 --> S014
    S015 --> S016
    S006 --> S016
    S015 --> S017
    S008 --> S017
    S009 --> S017
    S016 --> S017
    S015 --> S018
    S004 --> S018
    S005 --> S018
    S008 --> S019
    S014 --> S019
    S016 --> S019
    S017 --> S019
    S018 --> S019

    classDef w0 fill:#ffcdd2; classDef w1 fill:#ffe0b2; classDef w2 fill:#fff9c4;
    classDef w3 fill:#c8e6c9; classDef w4 fill:#b3e5fc; classDef w5 fill:#d1c4e9;
    class S001 w0
    class S002,S003,S015 w1
    class S004,S005,S006,S007 w2
    class S009,S010,S011,S012,S013 w3
    class S008 w3
    class S014,S016,S017 w4
    class S018,S019 w5
```

## Waves

### Wave 0 — Foundation (SPEC-001)
- **Objective:** runnable skeletons, error/logging/config infra, compose + CI.
- **Exit:** both sides build & test green; compose boots; CI workflow exists.

### Wave 1 — Data, Security, FE Shell (SPEC-002, SPEC-003, SPEC-015)
- **Parallel:** 002/003/015 touch disjoint trees (`backend/infrastructure/db`, `backend/auth`, `frontend/src/*` shell).
- **Integration checkpoint:** backend boots with schema; login returns JWT; FE shell consumes problem+json.
- **Exit:** migrations+seed applied automatically; AT-01/02/03 green; FE foundation tests green.

### Wave 2 — Core Domain APIs (SPEC-004, SPEC-005, SPEC-006+007)
- **Parallel:** users / centers / request-core are disjoint modules; SPEC-007 is executed by SPEC-006's agent (same files).
- **Checkpoint:** request CRUD + list + detail with allowedActions working against real DB.
- **Exit:** AT-04..AT-10, AT-15/16 green; money property tests green.

### Wave 3 — Workflow Engine (SPEC-009, SPEC-010, SPEC-011, SPEC-012, SPEC-013 → SPEC-008)
- **Order within wave:** 009/010/011/012/013 start in parallel (disjoint modules); SPEC-008 (orchestrator)
  starts last and integrates them; SPEC-013's guard wires into 008's endpoints.
- **Checkpoint:** full lifecycle on Testcontainers — submit → 3 approvals → APPROVED with consumption;
  resubmission → v2; failed budget path; audit trail.
- **Exit:** IT-01..IT-09 + CT-01/02/04/05 green (the five README §5.2 integration scenarios).

### Wave 4 — Reporting + FE Features (SPEC-014, SPEC-016, SPEC-017)
- **Parallel:** 014 is backend-read-only; 016/017 build on the frozen FE foundation and APIs.
- **Checkpoint:** dashboard reflects role scope; FE list/form/detail/inbox complete end-to-end.
- **Exit:** AT-14/17; FT-01..FT-05 green; ≥3 significant FE tests.

### Wave 5 — Admin UI + Integration (SPEC-018, SPEC-019)
- **SPEC-018 optional** (P2) — may be dropped without affecting evaluation minimums.
- **SPEC-019** runs the full matrices, contract tests, compose smoke, delivery checklist.
- **Exit:** everything green; CI green; SOLUTION/AI_USAGE/README cross-check done.

### Wave 6 — Final packaging
- Compose-from-clean-clone verification, `SOLUTION.md` review, video script alignment (candidate task), final commit hygiene check (trailers present).

## Parallelization summary

| Wave | Parallel agents | Shared-file risk |
|---|---|---|
| 0 | 1 | — |
| 1 | 3 (002/003/015) | none (disjoint trees; SPEC-002 owns `db/`, SPEC-003 owns `auth/`+guards, SPEC-015 owns FE shell) |
| 2 | 3 (004/005/006+007) | none by module split; SPEC-006 agent also owns SPEC-007 files |
| 3 | 5 → 1 integrator (008) | SPEC-008 integrates 5 modules but writes only `transition/` + controller wiring |
| 4 | 3 (014/016/017) | 016/017 share FE component dirs — mitigate: 016 owns `features/requests`, 017 owns `features/approvals`, shared primitives must already exist (foundation) |
| 5 | 1–2 | SPEC-019 owns `test/`, `scripts/` only |

## Critical path

SPEC-001 → SPEC-002 → SPEC-003 → SPEC-006/007 → SPEC-008 → SPEC-019 (15 tasks deep).
Float: SPEC-004/005 (+2 waves), SPEC-009/010/011/012/013 (join at 008), SPEC-014 (+1), FE specs (parallel to backend waves 2–3 via contract-first mocks).
