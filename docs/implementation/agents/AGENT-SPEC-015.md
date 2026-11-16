# AGENT-SPEC-015 — Frontend Foundation

> **Historical — superseded.** This prompt was written to drive an AI agent on the originally planned
> stack (NestJS + TypeORM / React + react-hook-form + zod). The feature was implemented on Spring Boot 4.1
> (Java 25) and React + Ant Design instead; the as-built design is §6 of the matching spec in
> `docs/specifications/`. Repository rules (AGENTS.md: logging, trailers, protected files) still apply.

## Mission
Build the SPA shell every screen uses: router + role guards, auth store, problem+json-aware API
client, global 401/409/422 surfaces, form-error mapping primitives, TanStack Query provider.

## Mandatory reading order
1. Repository `README.md` (§2.7) + `AGENTS.md`.
2. `docs/api/API-DESIGN.md` (conventions), `docs/api/ERROR-CATALOG.md` §4 (UX contract).
3. `docs/architecture/diagrams/frontend-flow.md`, `ADR-013` (docs/adr/ADR-013-frontend-architecture.md).
4. `SHARED-CONTRACTS.md`, `docs/specifications/SPEC-015-frontend-foundation.md`.

## Rules
- Work only in `frontend/src/{app,shared}/**` + tooling config for the FE workspace.
- TypeScript types mirror `docs/api/openapi.yaml` (hand-written or generated — your choice; keep drift-detectable for SPEC-019).
- AI-log snapshot/record; commit trailers.

## Scope (in)
- Router (React Router 6): routes shell `/login`, `/` (dashboard), `/requests`, `/requests/:id`, `/approvals`, `/admin/*`; guards by role (`RequireRole`).
- Auth store (context + sessionStorage): token, user, login/logout, `returnUrl` handling.
- `ApiClient`: fetch wrapper adding `Authorization` + `X-Request-Id`; parses problem+json into typed `ApiError {status, code, detail, errors?, currentLockVersion?}`; retries only on 5xx/network.
- Global handlers: 401 ⇒ logout + `/login?returnUrl=`; 409 ⇒ conflict banner hook; 422 ⇒ banner + `errors[]` field mapper (`<FieldError>`).
- UI kit: layout, loading/empty/error states, toast system; QueryProvider.

## Contracts you must not break
- Frozen exports for SPEC-016/017/018: `ApiClient`, `useAuth`, `QueryProvider`, `ErrorBanner`, `FieldError`, `useApiMutation`.

## Validation
- `cd frontend && npm test && npm run build` green with ≥5 tests: login stores token; 401 redirect preserves returnUrl; ApiError parses catalog sample; guard blocks SOLICITANTE from `/approvals`.

## Report format
Modified files, test summary, exported API surface list, deviations, blockers.
