# ADR-013 — Front-end Architecture: Vite SPA with Ant Design and a Swappable Fake Backend

**Status:** Accepted · revised 2026-11-15 to match the implementation
**Date:** 2026-11-15

## Context
README §2.7 requires role-protected routes, URL-reflected server-side list state, `allowedActions`-driven
UI, a dynamic-item form with a live (display-only) total, session-expiry redirect, and clear 409/422
feedback. Framework choice is free (§5.1, §7.2). The back end was not runnable while the UI was built.

## Problem
Choose a front-end shape that keeps business logic out of the client (README §1: "sem duplicar as regras
do back-end"), stays small, and can be demonstrated and tested before the real API runs.

## Options Considered
1. React SPA (Vite) + TanStack Query + React Router + react-hook-form + zod + plain CSS (the original plan).
2. **React SPA (Vite) + TanStack Query + React Router + Ant Design (components and `Form`)** (implemented).
3. Next.js or Angular.

## Decision
Option 2.
- **UI kit:** Ant Design 5 — `Layout`/`Sider` shell, `Table` with server-side paging/sorting, `Form` +
  `Form.List` for dynamic items, `Modal` for the mandatory comment, `Result` for 403/404, theme tokens
  in `ConfigProvider`, `App.useApp()` for messages. Shared helpers in `src/shared/ui.tsx`.
- **Server state:** TanStack Query (cache, invalidation after every action, no retry on 4xx).
- **URL state:** list filters, sort and page live in `useSearchParams` (shareable links).
- **Auth:** `AuthContext` keeps the token in `sessionStorage`; any `401` → `/login?returnUrl=…`.
- **API client:** `src/shared/api/client.ts` adds `Authorization` and `X-Request-Id`, unwraps
  `problem+json` into `ApiError`. Field errors (`errors[]`) are mapped onto form fields.
- **Rules stay on the server:** buttons render only from `allowedActions`; the form total is display only.
- **Fake backend:** `src/shared/api/mock/` implements the API contract in the browser (state machine,
  chains, segregation, budget, versions, idempotency, visibility, 404/403/409/422 order), persisted in
  `localStorage`. `VITE_MOCK_BACKEND=true` (default) uses it; `false` calls the real API through the
  Vite proxy `/api` → `http://localhost:3000`.

## Rationale
Ant Design removes most hand-written UI plumbing (server-sorted tables, dynamic form lists, modals), so the
code focuses on the README behaviors. The fake backend let the whole UI — and the Cypress suite — be built
and verified while the Java API was still a draft; switching is one environment variable.

## Consequences
- The fake backend duplicates the business rules **in the client** — acceptable only because it is a
  stand-in for the server, never used against the real API. It must be kept in sync with the back end
  until it is retired.
- Larger bundle (Ant Design): ~1.4 MB minified, a Vite size warning; route-level code splitting is a known follow-up.
- A test-only hook (`window.__mockBackend`) is exposed only when running inside Cypress, so the 409 test
  can act as a second user.

## Trade-offs
Token in `sessionStorage` (XSS-aware trade-off; no refresh token). No SSR (internal tool behind login).

## Related
ADR-006, ADR-014; `frontend/README.md`; SPEC-015…018.
