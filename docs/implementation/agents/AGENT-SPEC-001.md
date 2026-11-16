# AGENT-SPEC-001 — Project Foundation & Infrastructure

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Create the runnable skeleton for the whole solution: NestJS back-end and React+Vite front-end, shared
cross-cutting infrastructure, docker-compose, CI, READMEs. You are the only writer in Wave 0.

## Mandatory reading order (before any file change)
1. Repository `README.md` (challenge statement) and `AGENTS.md` (rules — eliminatory).
2. `docs/architecture/OVERVIEW.md` and `docs/architecture/SYSTEM-DESIGN.md`.
3. `docs/implementation/SHARED-CONTRACTS.md` (binding).
4. Your spec: `docs/specifications/SPEC-001-project-foundation-infrastructure.md`.

## Rules
- Work only in `backend/`, `frontend/`, `.github/workflows/`, `docker-compose.yml`, `.env.example` (+ root tooling files like `.dockerignore`).
- Do NOT implement any business endpoint except `/health` stub. Do NOT create DB schema (SPEC-002 owns it).
- Start and end your turn with the AI log commands (AGENTS.md §0): `bash .agents/hooks/ai-log.sh snapshot <Agent>` and `bash .agents/hooks/ai-log.sh record <Agent> "<summary>"`.
- Commits: Conventional Commits + trailers `AI-Assisted: yes`, `AI-Agent: <Agent>`.

## Scope (in)
- Backend scaffold: NestJS 10, TS strict, eslint with layer-import rules (`domain` imports nothing; `application` only `domain`/`ports`), jest, folder layout `src/{domain,application,shared,infrastructure}`, pino logger, config module with zod validation, `ProblemDetailFactory`, `GlobalExceptionFilter`, `RequestIdMiddleware`, pagination/sort helpers, `/health` stub (503 until SPEC-014 completes DB probe).
- Frontend scaffold: Vite + React 18 + TS strict, eslint, vitest+RTL wired, folder layout.
- `docker-compose.yml` (db postgres:16 + backend + frontend with healthchecks and entrypoint running migrations+seed+start — entrypoint may reference scripts SPEC-002/019 finalize), both `Dockerfile`s, `.env.example` (every var: DB_*, JWT_*, PORT, NODE_ENV, TZ, SEED flags), `.github/workflows/ci.yml` (backend job: install/lint/unit/build; frontend job: install/lint/test/build), `backend/README.md`, `frontend/README.md`.

## Contracts you must not break
- Error body = RFC 9457 fields `type/title/status/detail/code/requestId` (+`errors[]`, `currentLockVersion`) per `docs/api/ERROR-CATALOG.md`.
- `X-Request-Id` echoed on every response.
- No husky/lefthook/pre-commit or any `core.hooksPath` change.

## Validation (must pass before you report done)
- `cd backend && npm test && npm run build`
- `cd frontend && npm test && npm run build`
- `docker compose config` (valid) — full `up --build` may be verified by SPEC-019; ensure db service starts.

## Report format
Modified files (paths), test/build outputs (summaries), deviations, blockers, suggested Wave-1 notes.
