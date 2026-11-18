# ADR-013 — Front-end Architecture: Vite SPA with Ant Design and a Swappable Fake Backend

**Status:** Accepted · revised 2026-11-18 to match the current implementation
**Date:** 2026-11-15

## Context
README §2.7 requires role-protected routes, URL-reflected server-side list state, `allowedActions`-driven
UI, a dynamic-item form with a live (display-only) total, session-expiry redirect, and clear 409/422
feedback. Framework choice is free (§5.1, §7.2). The back end was not runnable while the UI was first built;
today the SPA runs against the real API (compose, `npm run dev:api`) and against a fake backend (dev, E2E).

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
  in `ConfigProvider`, `App.useApp()` for messages. Every table filters and sorts from its column headers
  (`src/shared/tableSort.ts`) and every form input carries antd validation rules (`src/shared/validation.ts`):
  sign-up asks for a full name, shows a password-strength meter and a confirmation. Shared helpers in
  `src/shared/ui.tsx`; the company logo (`Logo.tsx`) is in the login card, the top bar and the favicon.
- **Server state:** TanStack Query (cache, invalidation after every action, no retry on 4xx). The cache is
  cleared whenever the session changes, and a saved request seeds its own cache entry, so a screen never
  shows another user's data or a pre-edit `lockVersion`.
- **URL state:** list filters, sort and page live in `useSearchParams` (shareable links).
- **Auth:** `AuthContext` keeps the token in `sessionStorage`; any `401` → `/login?returnUrl=…`, and only
  same-origin app paths are accepted as `returnUrl` (SEC-F02). "Sair" also ends the server session (ADR-015).
- **API client:** `src/shared/api/client.ts` adds `Authorization` and `X-Request-Id`, unwraps
  `problem+json` into `ApiError`. Field errors (`errors[]`) are mapped onto form fields. Request ids and
  idempotency keys come from `src/shared/uuid.ts`, which falls back to `crypto.getRandomValues` on plain-HTTP
  sites where `crypto.randomUUID` does not exist.
- **Rules stay on the server:** buttons render only from `allowedActions`; the form total is display only.
- **Fake backend:** `src/shared/api/mock/` implements the API contract in the browser (state machine,
  chains, segregation, budget, versions, idempotency, visibility, 404/403/409/422 order), persisted in
  `localStorage`. It and the demo-login picker are **compile-time flags** (`define` in `vite.config.ts`,
  SEC-F04): on for the dev server and Cypress, off — and absent from the bundle — in production builds.
  `npm run dev:api` (or `VITE_MOCK_BACKEND=false`) calls the real API through the proxy `/api` →
  `http://localhost:3000`; the compose stack builds against the real API with the demo login on.
- **Serving:** the production image is Nginx (`frontend/nginx/`), with its own `/api` proxy whose backend
  host is resolved per request, so the container starts even without a backend (ADR-016).

## Rationale
Ant Design removes most hand-written UI plumbing (server-sorted tables, dynamic form lists, modals), so the
code focuses on the README behaviors. The fake backend let the whole UI — and the Cypress suite — be built
and verified while the Java API was still a draft; switching is one environment variable.

## Consequences
- The fake backend duplicates the business rules **in the client** — acceptable only because it is a
  stand-in for the server, never shipped in a production build. It is kept in sync with the back end by
  running the same Cypress checklist tests against both (ADR-014).
- Larger bundle (Ant Design), with a Vite chunk-size warning; route-level code splitting is a known follow-up.
- A test-only hook (`window.__mockBackend`) is exposed only when running inside Cypress, so the 409 test
  can act as a second user.

## Trade-offs
Token in `sessionStorage` (XSS-aware trade-off; no refresh token). No SSR (internal tool behind login).

## Verification
Cypress suites (ADR-014): one spec per screen plus `09-security` (hostile `returnUrl`) and the checklist (FE-01,
FE-04, FE-05, FE-06, FE-08, LIST-04 and DASH-01 for the session switch), against the fake backend and the real API.
Production bundle checked without the fake backend or demo credentials (`docs/security/FINDINGS.md` SEC-F04).

## Related
ADR-006, ADR-014; `frontend/README.md`; SPEC-015…018.
