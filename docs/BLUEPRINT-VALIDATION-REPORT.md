# Blueprint Validation Report

> Audit of the Software Engineering Blueprint. **Revision 3 — 2026-11-15** (revision 2 fixes in §1, second-review fixes in §1b).
> Revision 1 of this report claimed "15/15 PASS" and was **wrong**: an independent line-by-line review
> against the README found 17 defects (4 high, 6 medium, 7 low) that the original audit missed — most
> importantly a draft-visibility leak to ADMIN, a race that could return 422 instead of 409, a comment
> rule contradicted by the OpenAPI schema, and an editable cost center that broke version immutability.
> This revision documents every fix and re-runs the checks. Method: cross-review + automated checks.

## 1. External review findings → resolutions

### High (contradicted the README)

| # | Finding | Resolution | Where fixed |
|---|---|---|---|
| 1 | `ADMIN` could see other users' drafts (FR-011/UT-03/AGENT-SPEC-006 said "ADMIN: all"); no document settled ADMIN-cancel of an invisible draft | Drafts are owner-only **with no ADMIN exception** (README §2.2 wins over §1.1's general "vê tudo"). ADMIN cancels only *visible* requests; a foreign DRAFT is 404 → DRAFT cancel is owner-only in practice. New assumption **A-26**; ADR-012 updated | REQUIREMENTS FR-011 · ASSUMPTIONS A-26 · SPEC-006 §5/§10/§11 · AGENT-SPEC-006 · TEST-MATRIX UT-03/UT-17 · TRACEABILITY-MATRIX · ADR-012 |
| 2 | Same-step race on the **final** approval could return 422 + a false `APPROVAL_FAILED_BUDGET` event, because the budget UPDATE ran before the lock UPDATE and the failure path committed | The aggregate lock UPDATE is now the **first write** of the transition tx (READ COMMITTED re-evaluation ⇒ loser gets **409**, never 422). On `BUDGET_EXCEEDED`: **full rollback** (no lock bump), failure event written in a **separate short transaction** | TRANSACTION-STRATEGY §2/§3.1/§4/§5 · SYSTEM-DESIGN §1/§3/§5 · SPEC-008 §5/§6/§11 · SPEC-011 §5 · SEQ-03/07/08/09 · error-transaction-flow.md · ADR-009 · CT-01 (final-step-low-budget variant added) |
| 3 | `TransitionRequest.comment` had `minLength: 10` → an optional approve comment of "OK" would 400, contradicting README §2.3.4 | `minLength` removed from the schema; ≥10 chars enforced only by CommentPolicy for reject/return (422 COMMENT_REQUIRED). Structural validation keeps only maxLength | openapi.yaml · API-DESIGN §5 · ERROR-CATALOG §3 |
| 4 | `costCenterId` was editable but not snapshotted → editing it in CHANGES_REQUESTED rewrote v1's effective budget attribution, breaking immutability | The version snapshot now carries **frozen `cost_center_id`**; consumption charges the version's center; editing CC only affects the next version. New assumption **A-28** | ERD-LOGICAL · ERD-PHYSICAL §6 · migration 004 · DATA-DICTIONARY · SPEC-010 §5 · SPEC-011 §5 · class-diagram.puml · openapi `RequestVersionDto.costCenter` · ADR-011 |

### Medium

| # | Finding | Resolution | Where fixed |
|---|---|---|---|
| 5 | Ownership errors defined five ways (403 / 422 / INVALID_TRANSITION / "422 / 403" / missing catalog code) | Single rule: non-owner edit/submit or non-owner-non-ADMIN cancel → **`403 NOT_REQUEST_OWNER`** (after 404/403-role, before 409). New assumption **A-27**, new catalog code | ERROR-CATALOG · ADR-012 · SPEC-006 §5/§11 · SPEC-008 §5 · UT-16 · SEQ-06 · state-machine.puml · SHARED-CONTRACTS §4 |
| 6 | Idempotency race could still create duplicates (autocommit create + post-hoc key save / "discard ours") | Key is **reserved in the create transaction** (placeholder INSERT first; PK race → loser replays winner). Request and key rows commit atomically. New assumption **A-32** | API-DESIGN §6 (rewritten) · TRANSACTION-STRATEGY §3.4 · ADR-010 · SEQ-01/10 · SPEC-013 §5 · AGENT-SPEC-013 |
| 7 | The "defense in depth" partial unique index guarded nothing (base unique already covers (version, seq)) | Index **removed**; real guard = `UPDATE approval_steps … WHERE id=:id AND status='PENDING'` (0 rows → 409). DUPLICATE_APPROVER documented as app-level (aggregate lock serializes it) | migration 004 · ERD-PHYSICAL §8 · TRANSACTION-STRATEGY §3.3 · SEQ-08 · DATA-DICTIONARY · ADR-009 |
| 8 | Registration rules contradicted each other (SEC-006 "requester's own center" vs required costCenterId) | Registration **requires an existing `costCenterId`**; always creates SOLICITANTE | SEC-006 · A-15 · SPEC-003 · AGENT-SPEC-003 · API-DESIGN §5 |
| 9 | Steps never recorded rejection/return — chains showed PENDING forever | `StepStatus` extended: `PENDING/APPROVED/REJECTED/RETURNED`; reject → current step REJECTED, return → RETURNED. New assumption **A-31** | openapi StepStatus · migration 004 · ERD-LOGICAL/PHYSICAL · DATA-DICTIONARY · class-diagram.puml · SEQ-04/05 · SPEC-008 §5 |
| 10 | Immutability relied on REVOKE that is a no-op when the app role owns the tables; versions/items unprotected | One trigger `fn_no_update_delete()` on **all three** tables (`request_events`, `request_versions`, `version_items`); REVOKE kept as defense-in-depth for non-owner roles | migration 005 · ERD-PHYSICAL §6/§9 · ADR-004 · SPEC-002 |

### Low

| # | Finding | Resolution | Where fixed |
|---|---|---|---|
| 11 | CT-02 misread segregation (per-request rule) and imagined cross-center budgets | CT-02 rewritten: same center; segregation is per version — the same approver may approve finals of different requests | CONCURRENCY-TESTS CT-02 · TEST-MATRIX CT-02 |
| 12 | SPEC-009 acceptance criteria contained unfinished reasoning ("…only if they try again in v2? No —") | Rewritten cleanly: segregation resets per version; inbox shows v2 to a prior-version approver; DUPLICATE applies only within the same version. Inbox rule wording fixed | SPEC-009 §5/§11 · AGENT-SPEC-009 |
| 13 | Average approval time used `submitted_at` (last submission) — resubmitted requests look faster | Metric = decided_at − **first submission** (earliest SUBMITTED/RESUBMITTED event; A-29) | SPEC-014 §5 · A-29 |
| 14 | Pagination contradiction (clamp vs 400 INVALID_PAGINATION) | **Clamping** wins (A-30); `INVALID_PAGINATION` removed from the catalog; `INVALID_SORT` stays 400 | API-DESIGN §2 · ERROR-CATALOG · A-30 |
| 15 | Seed's R$49.200 consumed not backed by APPROVED requests; >10k demo flow would fight the exhausted budget | Seed accounting rule: consumed = Σ APPROVED totals; CC-TI-01's R$49.200 is one APPROVED request; the >R$10k flow uses CC-ADM-02 (A-33; SOLUTION.md must say so) | SPEC-002 §6 · INTEGRATION-CONTRACTS §6 |
| 16 | Leftover drafting text ("No — race-safe recipe…", "? — no:", "APProVAL", "23 operations") | All removed/fixed | API-DESIGN §3/§4.4/§6 · CT-04 · error-transaction-flow.md |
| 17 | Validation report claimed full consistency | This report (revision 2) supersedes it with the finding log above | here |

## 1b. Second review (after revision 2) → resolutions

| # | Finding | Resolution | Where fixed |
|---|---|---|---|
| R1 | Idempotency recipe "catch the unique violation, re-SELECT" cannot work on PostgreSQL (the error aborts the transaction); expired keys could never be reused because the expired row still holds the PK | Reservation is `INSERT … ON CONFLICT (user_id, idem_key) DO UPDATE … WHERE expires_at < now() RETURNING`: 1 row = key ours (fresh or expired takeover); 0 rows = live record → ROLLBACK, SELECT, replay/409. No error path inside the tx | TRANSACTION-STRATEGY §3.4 · API-DESIGN §6 · ADR-010 · A-32 · SPEC-013 §5 · AGENT-SPEC-013 · SEQ-01/10 |
| R2 | Seed "upsert by natural key" would hit the migration-005 immutability triggers on the second boot (backend crash) and overwrite evaluation data | Seed is **insert-if-absent only** (`ON CONFLICT DO NOTHING`; an existing seeded request is skipped with all its children); rerun test asserts no error and preserved approvals | SPEC-002 §5/§10 · AGENT-SPEC-002 · migrations/README · IT-08 |
| R3 | CT-01 low-budget variant was impossible per README §2.3 (a R$700 request has no ADMIN step unless SOFTWARE) and broke after round 1 (budget not reset) | Variant uses a SOFTWARE R$700 request (chain `[N1, ADMIN]`), races the ADMIN step with the two seeded admins, R$800 available, budget reset every round | CONCURRENCY-TESTS CT-01 · TEST-MATRIX CT-01 |
| R4 | Cancel left the current step PENDING; steps after a reject/return stayed PENDING | `StepStatus` adds `CANCELLED` (current step on cancel from PENDING_APPROVAL) and `SKIPPED` (later steps on reject/return/cancel, same tx). Invariant: a closed version has no PENDING step | A-31 · openapi StepStatus · migration 004 · ERD-LOGICAL/PHYSICAL · DATA-DICTIONARY · class-diagram · TRANSACTION-STRATEGY §2/§3.3 · SPEC-008 §5 · ADR-011 · SEQ-04/05 · UT-29 |
| R5 | TRANSACTION-STRATEGY §3.1 set status/decided_at in the first write (outcome not yet known) and contained a garbled sentence | Split into (1) first write = lock-only claim `RETURNING lock_version`, (2) last write = status/timestamps after all checks; snapshot-freshness argument rewritten | TRANSACTION-STRATEGY §3.1 |
| R6 | SPEC-014 acceptance criterion was ambiguous about colleagues' pending requests | Exact expected totals per role (requester: own only; approver: no drafts, all CC pending) | SPEC-014 §11 |
| R7 | Visibility after a cost-center change on a returned request was undecided | Approver visibility follows the request's **current** cost center; eligibility uses the current version's frozen center; alternative rejected and documented | A-28 · SPEC-006 §5 |
| R8 | Docs and SQL comments cited "review finding #N" (meaningless outside this report) | Replaced by requirement/ADR references | ADR-004 · ERD-PHYSICAL · migrations 004/005 · TRANSACTION-STRATEGY · SEQ-08 |

## 2. Automated checks re-run (all PASS)

| Check | Result |
|---|---|
| `openapi.yaml` parses; OpenAPI 3.1.0; 20 paths / 25 operations; all `$ref` resolve; `TransitionRequest.comment` has no `minLength`; `StepStatus` extended; `RequestVersionDto.costCenter` present | PASS |
| Mermaid fence balance (16 files) · `@startuml/@enduml` pairs (13 files) | PASS |
| No stale references: `ux_steps_one_approved`, `INVALID_PAGINATION`, "discard ours", `minLength: 10`, `APProVAL` — all gone (grep-verified) | PASS |
| Revision 3: no "unique violation → re-SELECT" recipe, no seed "upsert", no "review finding #" citation outside this report; `StepStatus` enum identical in openapi / migration 004 / ERD / class diagram (grep-verified) | PASS |
| Every test ID used in specs exists in TEST-MATRIX; every SPEC-ID referenced exists | PASS |

## 3. The 15-point audit (revised)

Items 1–15 were re-verified after the fixes. The audit now also explicitly checks **README-conformance of
graded behaviors** (draft visibility, 409-vs-422 on same-step races, comment optionality, version
immutability including cost center) rather than only internal consistency — the gap that made revision 1
overclaim. **Verdict: internally consistent AND README-conformant on all reviewed points, with the
residual limitations below.**

## 4. Residual limitations (honest list)

- Diagrams are validated as *sources* (syntax, fences, pairs); no SVG/PNG rendering in this environment.
- OpenAPI deep lint (spectral) not run — tooling unavailable; structural validation passed.
- ~~The blueprint remains planning-only~~ — superseded by revision 4 below: the code now exists.
- `Q-01…Q-10` open questions keep their provisional answers; any candidate override must update the
  matching assumption (A-01…A-33) and ADR together.

## 5. Revision 4 — documentation aligned with the implementation (2026-11-15)

The docs were rewritten to describe what is actually in `backend/` and `frontend/`, not the plan.

| Area | Change |
|---|---|
| Stack | ADR-002 records the switch NestJS/TypeORM → **Java 25 + Spring Boot 4.1 + JPA/Hibernate + Flyway**, and react-hook-form/zod → **Ant Design**; A-01/A-25 revised; deviations D-01…D-07 added to ASSUMPTIONS §E |
| ADRs | 001, 006, 007, 008, 010, 013, 014 rewritten for the Spring/antd implementation; 003, 004, 005, 009, 011, 012 gained "Implementation" pointers to the real classes and tests |
| Architecture | OVERVIEW, SYSTEM-DESIGN and the diagrams (components, layers/packages, containers, deployment marked *planned*, auth, front-end flow, error flow) redrawn; class diagram and sequences 01–07/10 now use the real classes and the real call order (lock claim before the policies) |
| Database | ERD-PHYSICAL and migrations/README point at Flyway `V1`–`V6` and `DemoSeed` (one-transaction, skip-if-present seed); data-dictionary cents example corrected (R$ 10.000,00 = 1 000 000 cents) |
| API | `GET /cost-centers` public, `Idempotent-Replayed` header, Actuator `/health` shape, problem `type` base URL, 400-before-404 note |
| Testing | TEST-MATRIX maps every planned ID to the real test or marks it missing; TEST-STRATEGY and CONCURRENCY-TESTS describe JUnit/Testcontainers/Cypress as built |
| Specs | each spec's status and §6 Architecture now describe what was built; SPEC-INDEX gained a State column |
| Planning record | `implementation/` (roadmap, Gantt, effort, contracts, 19 agent prompts) kept but bannered as historical |

**Honest state** (also in `docs/README.md`):
- The back end has **not been compiled or run**; its tests are written but not executed.
- The front end runs; its 46 Cypress tests are green against the in-browser fake backend.
- Missing deliverables: `docker-compose.yml`, CI workflow, `SOLUTION.md`, HTTP-level API tests,
  front-end component tests, OpenAPI contract test.

Checks re-run: `openapi.yaml` parses (25 operations); every Mermaid block closed; every `.puml` has one
`@startuml`/`@enduml`; no NestJS/TypeORM/Jest/zod reference remains outside the historical planning
record, quoted README text, the §9 task tables marked as the original plan, and ADR-002's history.

