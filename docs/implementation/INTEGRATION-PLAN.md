# Integration Plan

> **Historical planning record.** Written before implementation to coordinate parallel AI agents on the
> originally planned stack (NestJS + TypeORM, React + react-hook-form + zod). The project was then built
> with Spring Boot 4.1 (Java 25) and React + Ant Design — see `docs/README.md` (status) and ADR-002.
> Kept for traceability; it does not describe the current code.

> How independently implemented modules become one verified system. Executed by SPEC-019 with support
> from every wave's checkpoint.

## 1. Integration order

1. **Vertical slice first (Wave 2–3):** after SPEC-006/007, run a scripted slice — create request →
   inspect DB rows → assert totals. This catches mapping bugs before the workflow engine exists.
2. **Workflow engine integration (Wave 3 exit):** SPEC-008 wires 009/010/011/012/013. Checkpoint script:
   submit → approve ×3 → APPROVED with consumed budget; return → edit → resubmit → v2 with new chain;
   failed final approval path. Gate: IT-01..IT-09 green before Wave 4 starts.
3. **API surface freeze (Wave 4 start):** contract tests lock `openapi.yaml` semantics; front-end
   develops against frozen DTOs (and mocks from the seed).
4. **Front-to-back integration (Wave 4):** SPEC-016/017 run against the real backend (compose); visual
   checks against `allowedActions` matrix and error catalog UX rows.
5. **Full system (Wave 5–6):** SPEC-019 runs all suites + compose smoke from a clean clone; CI green;
   delivery checklist signed.

## 2. Contract verification

| Contract | Mechanism | Owner |
|---|---|---|
| OpenAPI ↔ code | served spec vs `docs/api/openapi.yaml` (operationIds, schemas, enums) — CI contract test | SPEC-019 |
| Error catalog | every `code` exercised in API tests with asserted shape | SPEC-019 (assertions written in each spec's tests) |
| DTO freeze | TypeScript types generated/mirrored once; drift fails CI | SPEC-015 + SPEC-019 |
| DB schema | introspection test vs ERD-PHYSICAL after migrations | SPEC-002/019 |
| allowedActions ⇔ inbox | cross-consistency contract test over a user×status matrix | SPEC-019 |

## 3. Build & migration validation

- Backend image builds (`nest build`), frontend builds (`tsc && vite build`) — CI gates.
- Migrations run on every backend boot in compose; migration tests assert up/down symmetry and
  idempotency of the executed-migrations tracking. Seed rerun leaves row counts unchanged.

## 4. Cross-module tests

- IT-01 (3-step flow with consumption) touches 006/008/009/010/011/012 — the primary integration proof.
- CT-01/CT-02 (concurrency) touch 008/011/013.
- Contract tests touch everything read-only.

## 5. Regression policy

- Any fix in a shared file requires re-running the full backend suite (one command) before commit.
- The matrices in `docs/testing/TEST-MATRIX.md` are the regression definition: if a change doesn't map
  to a matrix row, it needs a new row before merging.

## 6. Conflict resolution (parallel agents)

- Single-writer rule (SHARED-CONTRACTS §11) prevents most conflicts.
- If two agents need the same file: the later wave's agent writes an adapter/new file and files a
  consolidation request; the coordinator (SPEC-019) resolves before Wave 5.
- Git-level conflicts: rebase onto latest `teste-pleno`, re-run affected suites, keep commits small.

## 7. Final system validation

1. Clean clone → `docker compose up --build` → smoke script passes (health, login, lifecycle).
2. `npm test` both sides — full matrix green.
3. CI green on the final commit; trailers verified; protected files diff-clean.
4. Manual pass of README §8.1 operational flow against the seeded data (precondition for the candidate's video).
