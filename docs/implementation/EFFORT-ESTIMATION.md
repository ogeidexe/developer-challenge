# Effort Estimation

> **Historical planning record.** Written before implementation to coordinate parallel AI agents on the
> originally planned stack (NestJS + TypeORM, React + react-hook-form + zod). The project was then built
> with Spring Boot 4.1 (Java 25) and React + Ant Design — see `docs/README.md` (status) and ADR-002.
> Kept for traceability; it does not describe the current code.

> The README estimates 20–25 h (including video). Our estimate from the actual requirement set (150
> requirements, 25 operations, 10 tables, 6 hard invariants): **engineered hours are higher unless scope
> is consciously trimmed**. Three scenarios below. Hours = engineering effort (one developer or one agent
> at a time); parallel agents compress elapsed time, not effort.

## Per-specification estimates

| Spec | Dev h | Test h | Integration h | Total | Complexity | Risk | Parallel potential |
|---|---|---|---|---|---|---|---|
| SPEC-001 Foundation | 4 | 1 | 0.5 | 5.5 | M | L | — |
| SPEC-002 Database + Seed | 4 | 2 | 0.5 | 6.5 | M | M | high |
| SPEC-003 Auth | 4 | 2 | 0.5 | 6.5 | M | M | high |
| SPEC-004 Users admin | 2 | 1 | 0.5 | 3.5 | S | L | high |
| SPEC-005 Centers + Budgets | 2.5 | 1.5 | 0.5 | 4.5 | S | M | high |
| SPEC-006 Request core | 6 | 2 | 1 | 9 | L | M | medium |
| SPEC-007 Money/Items | 2 | 1 | 0 | 3 | S | L | with 006 |
| SPEC-008 Transitions | 8 | 3 | 1.5 | 12.5 | L | **H** | low (integrator) |
| SPEC-009 Rules + Inbox | 5 | 2.5 | 0.5 | 8 | M | M | high |
| SPEC-010 Versioning | 3.5 | 2 | 0.5 | 6 | M | M | high |
| SPEC-011 Budget consumption | 3 | 2.5 | 1 | 6.5 | M | **H** | medium |
| SPEC-012 Audit | 3 | 1.5 | 0.5 | 5 | M | L | high |
| SPEC-013 Idempotency + Locks | 4 | 2.5 | 1 | 7.5 | M | **H** | medium |
| SPEC-014 Dashboard | 2.5 | 1.5 | 0.5 | 4.5 | S | L | high |
| SPEC-015 FE Foundation | 5 | 2 | 0.5 | 7.5 | M | M | high (vs backend) |
| SPEC-016 FE Requests | 7 | 3 | 1 | 11 | L | M | medium |
| SPEC-017 FE Inbox | 4.5 | 2.5 | 0.5 | 7.5 | M | M | medium |
| SPEC-018 FE Admin (optional) | 3 | 1.5 | 0.5 | 5 | S | L | high |
| SPEC-019 Integration/Hardening | 5 | 4 | 2 | 11 | L | M | low |
| **Total** | **74.5** | **38** | **13.5** | **126** | | | |

Plus delivery overhead (commits hygiene, CI babysitting, SOLUTION/video prep is candidate time): **~10 h** → **~136 h total engineering**.

## Scenario 1 — MVP with controlled simplifications (≈ 55–65 h)

**Included:** all backend specs except: SPEC-018 (admin UI), SPEC-014 [D] metric avg-time, list filters
`minAmount/maxAmount/q` (keep core filters), idempotency replay kept (mandatory) but lazy purge
simplified (delete-on-insert only). Front-end: SPEC-015 + SPEC-016 + SPEC-017 (login, list, form,
detail, inbox, decision modal, error UX) — **skip** SPEC-018. Tests: UT core (state machine, chain,
money, policies), AT for graded endpoints, IT-01..IT-05, IT-09, CT-01/CT-02/CT-04 (one variant each),
FT-02/04/05 (the 3 significant tests).
**Cut deliberately (documented in SOLUTION.md):** dashboard avg metric, extra filters, admin UI, some negative API paths (keep the §4.3 order tests), contract-test suite reduced to OpenAPI sync only.
**Elapsed:** ~7–9 working days at 8 h/day with 2 parallel agents (backend+frontend).

## Scenario 2 — Complete implementation with AI-assisted development (≈ 95–110 h)

Everything in the blueprint except optional differentiators: all 19 specs with full test matrices
(UT/AT/IT/CT/FT), contract tests, compose smoke, CI green. Effort split ≈ 70 h backend, 30 h frontend,
15 h integration/hardening/delivery (matches the 126 h table minus admin UI polish and contract extras, compressed by agent speed).
**Elapsed:** ~5–7 calendar days with 3 parallel agents (waves overlap backend/frontend).

## Scenario 3 — High-quality with extensive testing & hardening (≈ 130–150 h)

Scenario 2 plus: transition-action idempotency [D] (FR-024), Playwright E2E of the §8.1 flow [D],
login rate limiting [D], Prometheus metrics [D], accessibility pass [D], 100-iteration concurrency
loops, full property-based money tests, mutation-testing spot checks on the state machine, public deploy [D].
**Elapsed:** ~8–10 calendar days with 3–4 parallel agents.

## Critical path

SPEC-001 → SPEC-002 → SPEC-003 → SPEC-006(+007) → SPEC-008 → SPEC-019 → final packaging.
Bottlenecks: SPEC-008 (integrates five modules — needs them stable) and SPEC-019 (last gate).
High-risk components: budget consumption races (ADR-009), idempotency replay (SPEC-013), timezone
competence month (SPEC-010).

## Minimum viable delivery scope

Compose-bootable system + seed + auth + request CRUD + full transition workflow with budget/audit +
3 integration scenarios + 2 concurrency tests + 3 significant FE tests + CI green + SOLUTION.md.
Everything else is quality margin.
