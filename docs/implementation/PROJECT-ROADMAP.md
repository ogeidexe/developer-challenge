# Project Roadmap

> **Historical planning record.** Written before implementation to coordinate parallel AI agents on the
> originally planned stack (NestJS + TypeORM, React + react-hook-form + zod). The project was then built
> with Spring Boot 4.1 (Java 25) and React + Ant Design — see `docs/README.md` (status) and ADR-002.
> Kept for traceability; it does not describe the current code.

> Calendar view of the waves for **Scenario 2 (complete implementation)** with 3 parallel agents
> (A=backend-1, B=backend-2, C=frontend). Adjust proportionally for Scenario 1/3 (see EFFORT-ESTIMATION).
> "Day" = working day (8 h). The candidate's video/SOLUTION work happens in parallel at the end.

## Milestones

| # | Milestone | Day | Evidence |
|---|---|---|---|
| M1 | Skeleton boots | 1 | compose up; CI green on scaffolds |
| M2 | Schema + auth live | 2–3 | migrations+seed auto-run; login returns JWT; AT-01..03 |
| M3 | Request core frozen | 4–5 | CRUD/list/detail contract tests; FE shell ready |
| M4 | Workflow engine proven | 6–8 | IT-01..IT-05, CT-01/02 green |
| M5 | Product UI complete | 8–10 | FT-01..FT-05 green against real API |
| M6 | System validated | 10–11 | full matrix green; smoke script; delivery checklist |
| M7 | Final packaging | 11–12 | clean-clone verification; SOLUTION/README cross-check; video recorded (candidate) |

## Workstreams

**Backend A (domain/workflow):** SPEC-001 → SPEC-002 → SPEC-006/007 → SPEC-009 → SPEC-010 → SPEC-011 → SPEC-008 → support SPEC-019.
**Backend B (platform/admin):** SPEC-003 → SPEC-004 → SPEC-005 → SPEC-012 → SPEC-013 → SPEC-014 → support SPEC-019.
**Frontend C:** SPEC-015 → SPEC-016 → SPEC-017 → (SPEC-018) → support SPEC-019 smoke.

## Day-by-day (Scenario 2)

| Day | Backend A | Backend B | Frontend C | Checkpoint |
|---|---|---|---|---|
| 1 | SPEC-001 backend part | SPEC-001 shared part + SPEC-002 start | SPEC-001 frontend part | M1: compose boots |
| 2 | SPEC-002 finish (migrations/seed) | SPEC-003 auth | SPEC-015 foundation | M2 evidence starts |
| 3 | SPEC-006/007 (domain + money) | SPEC-003 hardening; SPEC-004 | SPEC-015 tests | login JWT green |
| 4 | SPEC-006 services/controllers | SPEC-005 | SPEC-016 list+form | M3: request API frozen |
| 5 | SPEC-009 policies + inbox | SPEC-012 audit | SPEC-016 detail | AT-04..AT-13 |
| 6 | SPEC-010 versioning | SPEC-013 idempotency/locks | SPEC-016 tests; SPEC-017 start | versions+audit live |
| 7 | SPEC-011 consumption | SPEC-014 dashboard | SPEC-017 inbox+modal | consumption IT green |
| 8 | SPEC-008 transitions | CT support harness | SPEC-017 tests | **M4: workflow proven** |
| 9 | SPEC-008 hardening (precedence, failure paths) | SPEC-019 suites IT/CT | SPEC-018 (optional) | CT-01/02 green |
| 10 | contract tests + fixes | SPEC-019 contract + smoke | FT hardening | **M5: UI complete** |
| 11 | full-matrix run; fixes | delivery checklist script | smoke support | **M6: validated** |
| 12 | clean-clone verification; SOLUTION cross-check | CI green confirmation | (candidate video prep) | **M7** |

## Bottlenecks & mitigations

1. **SPEC-008 waits on five modules** — mitigated by Wave-3 parallel build + interface-first integration; contingency: candidate implements transitions manually while agents finish policies.
2. **Testcontainers on CI** — ubuntu-latest has Docker; pin PG image tag for reproducibility.
3. **Timezone/month-edge defects** — UT-09 + fixed-clock injection; do not rely on real dates in tests.
4. **Merge conflicts on `package.json`/module wiring** — single-writer rule + integration windows at each checkpoint.

## Scope guardrails

- If slipping > 1 day: drop SPEC-018 (admin UI) first, then [D] filters/metric, then CT-03 — never cut
  IT-01..IT-05, CT-01/CT-02, or the 3 significant FE tests (they are graded).
- If ahead: add Scenario-3 differentiators in priority order: transition idempotency → E2E → rate limiting.
