# Shared Development Contracts

> **Historical planning record.** Written before implementation to coordinate parallel AI agents on the
> originally planned stack (NestJS + TypeORM, React + react-hook-form + zod). The project was then built
> with Spring Boot 4.1 (Java 25) and React + Ant Design — see `docs/README.md` (status) and ADR-002.
> Kept for traceability; it does not describe the current code.

> Binding for every AI implementation agent. Deviations require an architectural-deviation note in the
> spec's task log and an update here. Language/terminology follows the blueprint documents.

## 1. Repository rules (eliminatory — README §10, AGENTS.md)
- Work **only** in allowed paths: `backend/`, `frontend/`, `docs/`, `.github/workflows/`, `docker-compose.yml`, `.env.example`, root tooling files. Never touch protected files.
- Log every change: `bash .agents/hooks/ai-log.sh snapshot <Agent>` at start; `bash .agents/hooks/ai-log.sh record <Agent> "<summary>"` before reporting done. If the logger fails, append manually (AGENTS.md §1.2) and say so.
- Every commit you create: Conventional Commits + trailers `AI-Assisted: yes` and `AI-Agent: <Agent>` (keep the tool's co-author trailer). Never `--no-verify`; never touch `core.hooksPath`; never add husky/lefthook/pre-commit.
- Do not write `SOLUTION.md` or `AI_USAGE.md` content for the candidate.

## 2. Naming conventions
- Backend (TS): classes `PascalCase`, files `kebab-case.ts`; domain services `*Policy`, `*Builder`, `*Service` in `domain/`; application services in `application/services`; ports in `application/ports`; adapters `TypeOrm*Repository`, `*Controller`, `*Guard`, `*Interceptor`, `*Filter`.
- Enums/values exactly as the contract: `SOLICITANTE`, `APROVADOR`, `ADMIN`; `NIVEL_1`, `NIVEL_2`; `DRAFT`, `PENDING_APPROVAL`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, `CANCELLED`; categories `EQUIPMENT`, `SERVICES`, `SUPPLIES`, `TRAVEL`, `SOFTWARE`, `OTHER`.
- DB: `snake_case` columns/tables exactly per ERD-PHYSICAL; money columns `*_cents` (`bigint`); timestamps `*_at timestamptz`.
- Frontend: `kebab-case` files; feature folders `features/<domain>`; hooks `use*`.

## 3. DTO & API response conventions
- DTOs per `docs/api/openapi.yaml` — no extra fields in responses, no missing required fields; unknown request fields ignored.
- Money = decimal string `^\d{1,13}\.\d{2}$`; dates ISO-8601 offset; pagination envelope `{data,page,size,totalElements,totalPages}`.
- Errors exclusively via `ProblemDetailFactory` (never hand-built bodies). Codes from ERROR-CATALOG only.

## 4. Error handling
- Domain code throws `DomainError` with a catalog code. Application maps to problem+json via the global filter. Controllers never catch-and-respond directly.
- Messages must explain the reason with context values (BR-15). Write them in Portuguese (domain language of the README) — e.g. the README's own example.
- Ownership violations use code `NOT_REQUEST_OWNER` (403); visibility failures are 404 `NOT_FOUND` — never 403/422 (ADR-012).

## 5. Database access
- Only through repository ports/adapters. Raw SQL allowed in exactly two places: the optimistic aggregate UPDATE and the conditional budget UPDATE (both live in their TypeORM adapters, text in TRANSACTION-STRATEGY §3).
- Every multi-write operation runs in the `@Transactional` boundary. No repository opens its own connection inside a tx context.

## 6. Transactions & concurrency
- Never swallow `CONCURRENCY_CONFLICT`. 409 responses include `currentLockVersion`.
- Never read-then-write `budgets` without the conditional UPDATE recipe.
- Idempotency: only `POST /requests` (SPEC-013). Do not add keys to transitions (FR-024 is an opt-in differentiator).

## 7. Logging
- `pino` JSON via the injected logger; every log line carries `requestId`; no passwords/tokens/hashes in logs; business actions log action + requestId + actor id at info level.

## 8. Authentication context
- Controllers receive identity via `@CurrentUser()` (never from body/params). Policies receive the full principal (id, role, costCenterId, approverLevel).

## 9. Testing conventions
- Jest (backend), Vitest + RTL (frontend). One command per side: `npm test`.
- Naming: `*.spec.ts` colocated unit tests; `backend/test/integration/**`, `backend/test/concurrency/**`, `backend/test/contract/**`; front `src/**/*.test.tsx?`.
- Test IDs from TEST-MATRIX (UT-xx, IT-xx, CT-xx, FT-xx, AT-xx) appear as `describe` blocks so matrix ↔ code stays greppable.
- Integration tests use the shared Testcontainers harness (SPEC-002) — never a local Postgres dependency.

## 10. Git conventions
- Branch: `teste-pleno` (evaluated branch). Small Conventional Commits scoped to one spec (`feat(requests): …`, `test(integration): …`). No force-push, no history rewriting.
- One spec per commit series; reference the SPEC id in the commit body line (`Spec: SPEC-008`).

## 11. Shared files & ownership (single-writer rule)

| Path | Owner (writer) | Others |
|---|---|---|
| `backend/src/shared/**` | SPEC-001 | read-only |
| `backend/src/infrastructure/db/**` | SPEC-002 | read-only (migrations registration reviewed by 002) |
| `backend/src/domain/**` | split by submodule: `domain/money` SPEC-007 · `domain/request` SPEC-006 · `domain/approval` SPEC-009 · `domain/statemachine` SPEC-008 | read-only outside owner |
| `backend/src/application/services/transition*` | SPEC-008 | read-only |
| `backend/src/infrastructure/http/filters, guards (Jwt/Roles)` | SPEC-003 | read-only; SPEC-013 adds LockVersionGuard as new file only |
| `frontend/src/shared/**`, `app/**` | SPEC-015 | read-only |
| `frontend/src/features/requests/**` | SPEC-016 | read-only |
| `frontend/src/features/approvals/**` | SPEC-017 | read-only |
| `docs/**` | this blueprint (agents: append ADRs/notes only) | — |
| `.github/workflows/**` | SPEC-001 (SPEC-019 may extend) | notify owner |

Conflicts resolve by: extend via new files > modify; propose interface change in your spec's deviation log rather than editing shared code.

## 12. Definition-of-done checklist (every agent)
- [ ] Scope limited to assigned SPEC; no drive-by changes.
- [ ] Tests written alongside code; relevant matrix IDs green.
- [ ] `npm test` + `npm run build` green on my side.
- [ ] No protected file modified; AI log recorded; commits carry trailers.
- [ ] Deviations documented in the spec file's change note (if any).
- [ ] Report: modified files, test results, remaining work/blockers.
