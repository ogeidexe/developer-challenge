# SPEC-015 — Frontend Foundation

## 1. Specification Metadata
- **ID:** SPEC-015 · **Feature:** SPA shell, auth store, API client, error surfaces · **Version:** 1.0
- **Priority:** P0 · **Complexity:** M (5–7 h) · **Dependencies:** SPEC-001 (contract only; buildable in Wave 1 against openapi.yaml) · **Wave:** 1
- **Responsible agent:** AGENT-SPEC-015 · **Status:** implemented in `frontend/` — runs, covered by Cypress

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
Every screen shares: token lifecycle, route guards by role, the problem+json-unwrapping client, and the
409/422/401 UX contract (README §2.7). Implemented once here and reused.

## 3. Scope
**In:** React Router setup with role guards; auth store (sessionStorage); `ApiClient` (fetch wrapper:
Bearer, `X-Request-Id`, problem+json → typed `ApiError {code,status,detail,errors?}`); global 401
interceptor → `/login?returnUrl=`; base UI (layout, empty/loading/error states, toast/banner system);
form primitives wired to `errors[]` field mapping.
**Out:** feature screens (SPEC-016/017/018).

## 4. Requirements
FR-031 · FR-039 · NFR-018 · NFR-020 (client) · INT-002

## 5. Business Rules
- 401 anywhere ⇒ clear session, redirect to login, restore original route after successful login.
- 409 ⇒ conflict banner + automatic detail refetch contract (consumed by feature screens).
- Client never computes business totals (display-only math allowed on forms, clearly marked).
- Role guards mirror server coarse checks (UX only — server remains authoritative).

## 6. Architecture (as implemented)
`src/App.tsx` (routes, `RequireAuth`, `RequireRole` → 403 `Result`), `src/main.tsx` (`ConfigProvider` theme tokens, `App` for messages, QueryClient: retry only on 5xx/network), `src/shared/api/{client,errors,types}.ts`, `src/shared/auth/AuthContext.tsx` (sessionStorage, 401 → `/login?returnUrl=`), `src/shared/ui.tsx` (status/step tags, `moneyBRL`, `PageHeader`, field-error mapping), `src/shared/api/mock/*` (fake backend, `VITE_MOCK_BACKEND`).

## 7. API Contract
Consumes `openapi.yaml` types (generated TS types or hand-mirrored interfaces — contract test in SPEC-019
verifies drift). Error union per ERROR-CATALOG.

## 8. Database Impact
None.

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 Router + layout + guards | shell | FT smoke |
| T02 ApiClient + ApiError mapping | client unit-tested | FT-05 |
| T03 Auth store + login flow + returnUrl | session | FT-02 |
| T04 Global error surfaces (401/409/422 banners, field mapper) | UX kit | FT-04/FT-05 |
| T05 TanStack Query + mutation helpers | data layer | FT smoke |

## 10. Testing Strategy
Component/logic tests: login success stores token; expired-session redirect preserves returnUrl; ApiError
parses problem+json incl. `errors[]` array; guard blocks `/approvals` for SOLICITANTE.

## 11. Acceptance Criteria
- **G**iven a stored token **W**hen any request returns 401 **T**hen the app clears the session and, after re-login, lands back on the original URL.
- **G**iven a 422 with `errors:[{field:"items[0].quantity",…}]` **W**hen rendering a form **T**then the message appears next to that field.

## 12. Integration Requirements
Foundation for SPEC-016/017/018; frozen exports (`ApiClient`, `useAuth`, `QueryProvider`, `ErrorBanner`, `FieldError`).

## 13. Risks
Token storage XSS surface — sessionStorage acceptable for challenge; note in SOLUTION.md.

## 14. Definition of Done
≥5 foundation tests green; login/redirect contract demonstrated in a test; AI-logged.
