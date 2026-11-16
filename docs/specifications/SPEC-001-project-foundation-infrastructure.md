# SPEC-001 — Project Foundation & Infrastructure

## 1. Specification Metadata
- **ID:** SPEC-001 · **Feature:** Project foundation & infrastructure · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (3–5 h) · **Dependencies:** none · **Wave:** 0
- **Responsible agent:** AGENT-SPEC-001 · **Status:** partial — Maven/Spring Boot skeleton, config, problem+json, request id, JSON logs and OpenAPI drafted in `backend/` — not yet compiled or run; front-end foundation implemented in `frontend/` — runs, covered by Cypress; **compose, CI and lint scripts missing**

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
Everything else builds on this: repository layout for `backend/` and `frontend/`, shared tooling,
environment-driven configuration, structured logging with request correlation, the RFC 9457 error
machinery, docker-compose orchestration and CI. It satisfies the eliminatory repository rules (INF-004).

## 3. Scope
**In (as built):** Maven Wrapper + Spring Boot 4.1 skeleton; typed, validated `app.*` configuration (`JWT_SECRET` required); `GlobalExceptionHandler` + `ProblemResponses` (problem+json); `RequestIdFilter`; ECS JSON logs; pagination/sort helpers; springdoc `/docs`; Actuator `/health`; root `.env.example`; Vite + React + Ant Design front-end scaffold. **Still to do:** root `docker-compose.yml`, `.github/workflows/ci.yml`, lint/format scripts (no tool that changes `core.hooksPath`).
**Out:** any business endpoint (later specs); application DB schema (SPEC-002); auth logic (SPEC-003).

## 4. Requirements
FR-064 · NFR-001 · NFR-007 · NFR-008 · NFR-009 · NFR-010 · NFR-011 · NFR-012 · NFR-017 (harness) ·
NFR-018 · NFR-024 · INF-001 · INF-002 · INF-003 · INF-004 · INF-006 · SUB-006 (READMEs) · QA-006 · QA-007

## 5. Business Rules
- BR-015: every error body is produced centrally with explanatory `detail`.
- BR-014: 401 comes from the security filter chain; 404 → 403 → 409 → 422 are enforced inside the services (`RequestAccess`, `RequestLock`, domain policies — ADR-007).
- No secret may be committed; boot fails fast listing missing env vars.
- No tool may touch `core.hooksPath` (husky/lefthook forbidden — eliminatory, README §10).

## 6. Architecture (as implemented)
- `backend/`: Java 25 + Spring Boot 4.1, Maven Wrapper; packages `domain` (plain Java), `persistence`, `application`, `security`, `api`, `config` under `com.example.purchase` (ADR-001). No ArchUnit rule yet — boundaries by convention.
- `frontend/`: Vite + React 18 + TypeScript + Ant Design 5; `src/features/*`, `src/shared/{api,auth,ui.tsx}`, `src/shared/api/mock` (fake backend).
- Shared kernel: `api.GlobalExceptionHandler` (problem+json, exhaustive switch over the sealed `DomainException`), `security.ProblemResponses` (401/403 from filters), `api.RequestIdFilter` (MDC + header), `CommonDtos.PageResponse<T>`, `RequestSpecifications.parseSort` (whitelist → 400 `INVALID_SORT`), typed `config.AppProperties` (`JWT_SECRET` required), ECS JSON logs, springdoc at `/docs`, Actuator `/health`.
- Missing: root `docker-compose.yml`, `.github/workflows/ci.yml`, lint/format scripts.

## 7. API Contract
Implements the problem+json envelope and `GET /health` stub (DB check finalized in SPEC-014). All 25
operations return errors exactly as `docs/api/ERROR-CATALOG.md`.

## 8. Database Impact
None directly (SPEC-002). Compose provisions `db`; backend connects via env.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Scaffold backend (Nest, TS strict, eslint layers, jest) | `backend/` builds, `npm test` green with dummy test | CI backend job passes |
| T02 Scaffold frontend (Vite, TS, eslint, vitest+RTL) | `frontend/` builds, `npm test` green | CI frontend job passes |
| T03 Env config module (zod-validated `process.env`, `.env.example`) | boot fails fast on missing vars; `.env.example` complete | unit test UT-13 |
| T04 ProblemDetailFactory + GlobalExceptionFilter + RequestIdMiddleware | problem+json on all routes; `X-Request-Id` echoed | AT-19/AT-20 |
| T05 Pino JSON logger bound to request id | structured logs with `requestId` field | manual + CI log check |
| T06 Pagination + sort whitelist helpers | envelope + clamping | unit tests |
| T07 docker-compose.yml + Dockerfiles + entrypoint | `docker compose up --build` boots all three services | IT-08 |
| T08 `.github/workflows/ci.yml` | lint+test+build jobs | green CI |
| T09 `backend/README.md`, `frontend/README.md` | run/test instructions (SUB-006) | review |

## 10. Testing Strategy
Unit: env validation, problem-detail mapping, pagination parsing. API: 404 path returns problem+json
with requestId. No DB tests yet.

## 11. Acceptance Criteria
- **G**iven no env var `DB_URL` **W**hen the backend boots **T**hen it exits non-zero with a clear message.
- **G**iven any route throws unexpectedly **W**hen the response returns **T**hen it is `application/problem+json` with `code=INTERNAL` and no stack trace, and the response carries `X-Request-Id`.
- **G**iven a fresh clone **W**hen `docker compose up --build` runs **T**hen db, backend, frontend start and `/health` responds (DB check pending SPEC-014 → returns 503 until then, which is acceptable interim).

## 12. Integration Requirements
Defines conventions every later spec follows (SHARED-CONTRACTS.md). Do not rename folders/enums without updating all specs.

## 13. Risks
Hook-changing deps sneaking in via templates — mitigate by reviewing generated `package.json`.
Windows path issues in compose — keep POSIX paths.

## 14. Definition of Done
`npm test`/`npm run build` green both sides; CI green; compose boots; no protected file touched; AI log entries recorded per AGENTS.md.
