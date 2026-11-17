# ADR-016 — Nginx Reverse Proxy as the Single HTTP Entry Point

**Status:** Accepted
**Date:** 2026-11-16

## Context
`docker compose up` published the frontend (`:8080`, an Nginx that also proxied `/api`) and the backend
(`:3000`) directly on the host. Browser traffic and API traffic had two doors, security headers lived only in
the frontend image, and per-client login limiting in the backend sees the TCP peer, which behind any proxy is
the proxy itself (the backend deliberately ignores `X-Forwarded-For`, which is spoofable; SEC-F01).

## Options
1. Keep the frontend container as the proxy (previous state).
2. **A dedicated Nginx gateway service** in front of everything; backend and frontend become internal.
3. A heavier API gateway (Traefik, Kong, Spring Cloud Gateway): more features than this project needs.

## Decision
Option 2: a `gateway` service (`nginxinc/nginx-unprivileged`, non-root) is the only published HTTP port
(`HTTP_PORT`, default 8080).
- Routes: `/` → frontend (static SPA); `/api/*` → backend with the `/api` prefix stripped (the same contract as
  the Vite dev proxy and the frontend image); `/health`, `/docs`, `/swagger-ui/`, `/v3/api-docs` → backend.
- Edge concerns: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`; gzip;
  1 MB body limit (same as `MAX_REQUEST_BODY`); `X-Request-Id` kept or generated (the backend still validates
  it); `X-Forwarded-*` headers; `server_tokens off`; keep-alive to upstreams.
- **Per-IP login rate limit** at the edge (`limit_req` on `/api/auth/login`, `GATEWAY_LOGIN_RATE`, default
  `30r/m`, burst 20). The backend keeps its per-account and per-client limits.
- The config is inline in `docker-compose.yml` (Compose `configs`), which keeps every file inside the
  repository's allowed paths (AGENTS.md §3).
- Backend, frontend and Redis are not published; PostgreSQL stays on `127.0.0.1` for a locally run backend.
- The backend healthcheck now requires HTTP `200` from `/health` (overall `UP` and ready), so the gateway
  starts only after the demo seed has finished.

## Consequences
- One public door: TLS termination, caching or WAF rules can be added in one place later (TLS is not
  configured: local demo).
- Local development without Docker is unchanged (`npm run dev:api` proxies to `localhost:3000`).
- The frontend image keeps its own `/api` proxy (`BACKEND_URL`) so it still works when run alone.
- Because the compose frontend no longer waits for the backend, the frontend Nginx resolves `BACKEND_URL` per
  request (`resolver ${NGINX_LOCAL_RESOLVERS}` + `proxy_pass $backend_upstream`, with
  `NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1` in the image). A literal upstream host made Nginx fail at startup with
  `host not found in upstream "backend"`, which left the container unhealthy and blocked the gateway.

## Verification
CI compose job: smoke test only through the gateway (health with db and Redis `UP`, security headers, Swagger,
login, logout, backend not reachable on the host), then the real-API Cypress suite against `http://localhost:8080`. Before the full stack, the job starts the
frontend alone (`--no-deps frontend`) and requires it to become healthy.
