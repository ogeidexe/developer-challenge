# Technical Documentation — Purchase Request System

[![version](https://img.shields.io/github/v/release/ogeidexe/developer-challenge?include_prereleases&sort=semver&label=version)](https://github.com/ogeidexe/developer-challenge/releases) [![ci](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml/badge.svg?branch=teste-pleno)](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml?query=branch%3Ateste-pleno) [![security](https://github.com/ogeidexe/developer-challenge/actions/workflows/security.yml/badge.svg?branch=teste-pleno)](https://github.com/ogeidexe/developer-challenge/actions/workflows/security.yml?query=branch%3Ateste-pleno) [![tests](https://img.shields.io/endpoint?url=https://ogeidexe.github.io/developer-challenge/badges/tests.json)](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml?query=branch%3Ateste-pleno)

> Documentation for the Kingspan developer challenge (branch `teste-pleno`). It started as a
> planning blueprint and is now kept in sync with **what is implemented** in `backend/` and `frontend/`.
> The original planning and AI-orchestration material is kept as a historical record and marked as such.

## Implementation status (2026-11-15)

| Part | Stack | State |
|---|---|---|
| `backend/` | Java 25 · Spring Boot 4.1.2 · Spring Security 7 (JWT HS256) · Spring Data JPA / Hibernate 7 · PostgreSQL 16 · Flyway · springdoc 3 | **Drafted, not yet compiled or run** (no JDK in the authoring environment). Domain, persistence, services, API, seed and tests are written. |
| `frontend/` | React 18 · Vite 5 · TypeScript · Ant Design 5 · TanStack Query 5 · React Router 6 | Runs. Uses an **in-browser fake backend** by default (`VITE_MOCK_BACKEND=true`); `false` talks to the real API through the `/api` proxy. |
| Front-end tests | Cypress 13 | 8 specs / 46 end-to-end tests, all green against the fake backend (`npm run test:e2e`). No component tests yet. |
| Back-end tests | JUnit 5 + AssertJ · Testcontainers PostgreSQL | Written (unit, integration, concurrency); **not yet executed**. |
| Not started | `docker-compose.yml`, `.github/workflows/` (CI), `SOLUTION.md` | Required by the challenge (README §5.3, §5.5). |

The stack changed after planning: the blueprint chose NestJS + TypeORM (back end) and react-hook-form +
zod + plain CSS (front end). The ADRs and architecture documents now describe the real stack; see
[ADR-002](adr/ADR-002-technology-stack.md) for the decision and its history.

## Map

| Area | Documents |
|---|---|
| Requirements | [analysis/REQUIREMENTS.md](analysis/REQUIREMENTS.md) (150 reqs) · [TRACEABILITY-MATRIX.md](analysis/TRACEABILITY-MATRIX.md) (requirement → code → test) · [ASSUMPTIONS-AND-OPEN-QUESTIONS.md](analysis/ASSUMPTIONS-AND-OPEN-QUESTIONS.md) |
| Architecture | [architecture/OVERVIEW.md](architecture/OVERVIEW.md) · [SYSTEM-DESIGN.md](architecture/SYSTEM-DESIGN.md) · [diagrams/](architecture/diagrams) (Mermaid) · [uml/](architecture/uml) (PlantUML: class, use case, state machine, 10 sequences) |
| Database | [database/ERD-CONCEPTUAL.md](database/ERD-CONCEPTUAL.md) · [ERD-LOGICAL.md](database/ERD-LOGICAL.md) · [ERD-PHYSICAL.md](database/ERD-PHYSICAL.md) · [DATA-DICTIONARY.md](database/DATA-DICTIONARY.md) · [TRANSACTION-STRATEGY.md](database/TRANSACTION-STRATEGY.md) · [migrations/](database/migrations) (reference SQL; the executed copies are Flyway `V1`–`V6` in `backend/`) |
| API | [api/API-DESIGN.md](api/API-DESIGN.md) · [api/openapi.yaml](api/openapi.yaml) (OpenAPI 3.1, 25 ops) · [ERROR-CATALOG.md](api/ERROR-CATALOG.md) · [INTEGRATION-CONTRACTS.md](api/INTEGRATION-CONTRACTS.md) |
| Decisions | [adr/](adr) — 14 ADRs (incl. the 3 mandated: ADR-009 concurrency, ADR-011 versioning/history, ADR-012 403×404) |
| Testing | [testing/TEST-STRATEGY.md](testing/TEST-STRATEGY.md) · [TEST-MATRIX.md](testing/TEST-MATRIX.md) (planned ID → real test) · [CONCURRENCY-TESTS.md](testing/CONCURRENCY-TESTS.md) |
| Security | [security/README.md](security/README.md): threat model, findings (27), remediation log, risk register, test plan/results, CI pipeline (2026-11-15 audit) |
| Specifications | [specifications/SPEC-INDEX.md](specifications/SPEC-INDEX.md) + 19 feature specs (each with an "Implementation" note) |
| Planning record (historical) | [implementation/](implementation) — dependency graph, roadmap, effort, Gantt, shared contracts, and the 19 [agent prompts](implementation/agents) used to plan parallel AI work; they reference the original planned stack |
| Audit | [BLUEPRINT-VALIDATION-REPORT.md](BLUEPRINT-VALIDATION-REPORT.md) · [BLUEPRINT-PROGRESS.md](BLUEPRINT-PROGRESS.md) |

## Where to start

- **Understanding the system** — [architecture/OVERVIEW.md](architecture/OVERVIEW.md), then the ADRs.
- **Running it** — `backend/README.md` and `frontend/README.md` (commands, variables, seed users).
- **Changing a rule** — find the requirement in [TRACEABILITY-MATRIX.md](analysis/TRACEABILITY-MATRIX.md); it points at the class and the test.
- **Repository rules** — the root `README.md` and `AGENTS.md` (protected files, AI logging, commit trailers) apply to every change.
