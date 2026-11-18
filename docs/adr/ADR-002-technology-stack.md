# ADR-002 — Technology Stack

**Status:** Accepted — **supersedes the planned NestJS/TypeORM stack** · revised 2026-11-18 to match the current implementation
**Date:** 2026-11-15

## Context
README §5.1 permits Java (Spring Boot) or Node.js (NestJS / Express / Fastify), React (Next.js accepted)
or Angular, a relational database (PostgreSQL recommended) and a versioned migration tool.

The planning blueprint chose **Node 20 + NestJS 10 + TypeORM + Jest** for the back end and **React +
Vite + react-hook-form + zod + plain CSS + Vitest/RTL** for the front end. During implementation the
candidate chose a different stack, recorded here so the documentation matches the code.

## Problem
Pick the stack that best demonstrates the evaluated skills — domain modeling, transactions, concurrency
control, testing — while meeting every NFR.

## Options Considered
1. NestJS + TypeORM + PostgreSQL / React + Vite (the original plan).
2. **Spring Boot + Spring Data JPA (Hibernate) + Flyway + PostgreSQL / React + Vite + Ant Design** (implemented).
3. Fastify + Prisma / Next.js.

## Decision
Option 2.

| Layer | Choice | Version |
|---|---|---|
| Back-end language | Java (records, sealed classes, pattern matching, virtual threads) | 25 |
| Framework | Spring Boot (Spring Framework 7, Spring Security 7) | 4.1.2 |
| Persistence | Spring Data JPA + Hibernate 7; `JdbcClient` for the idempotency SQL | Boot-managed |
| Migrations | Flyway (`backend/src/main/resources/db/migration`, `V1`–`V7`) | Boot-managed |
| Database | PostgreSQL (compose image `postgres:17-alpine`) | 17 |
| Sessions | Redis, one session per issued JWT (ADR-015) | 7.4 |
| Auth | OAuth2 Resource Server (Nimbus) with HS256 JWT; BCrypt | Boot-managed |
| API docs | springdoc-openapi (Swagger UI at `/docs`) | 3.2.0 |
| Ops | Actuator (`/health` incl. DB and Redis), ECS structured JSON logs | Boot-managed |
| HTTP entry | Nginx gateway, the only published port (ADR-016) | `nginx-unprivileged` 1.27 |
| Back-end tests | JUnit 5, AssertJ, Testcontainers (`postgres:16-alpine`, `redis:7-alpine`) | Boot-managed |
| Back-end quality | Checkstyle (in `./mvnw verify`) | — |
| Build | Maven Wrapper (`./mvnw`) | Maven 3.10 |
| Front end | React 18 + Vite 5 + TypeScript 5, Ant Design 5, TanStack Query 5, React Router 6, dayjs | — |
| Front-end tests | Cypress end-to-end, two suites: fake backend and real API | 13.17 |
| Front-end quality | ESLint 9 + Prettier | — |
| Delivery | Docker Compose; GitHub Actions `ci`, `security`, `release` (images on GHCR) | — |

## Rationale
- **Spring** gives first-class declarative transactions (`@Transactional`, propagation `REQUIRES_NEW`
  for the post-rollback audit event), Spring Data for queries/Specifications, and Spring Security's
  resource-server JWT support — the exact tools the hardest requirements need.
- **Hibernate + native SQL where it matters**: entities for ordinary CRUD; the concurrency-critical
  writes (`lock_version` claim, conditional budget consumption, status-guarded step decision,
  `INSERT … ON CONFLICT` idempotency) are explicit SQL/JPQL so their semantics are visible and reviewable.
- **Java 25** features map onto the domain: records for values and DTOs, a sealed exception hierarchy
  mapped by an exhaustive `switch`, virtual threads for request handling.
- **Ant Design** (front end) provides tables with server-side sorting/paging, forms with dynamic lists,
  modals and result pages out of the box, so the UI work stays on the README §2.7 behaviors.
- Spring Boot 4.1 is the current line with first-class Java 25 support; the 3.5 line's OSS support ended in 2026.

## Consequences
- Two languages (Java back end, TypeScript front end); DTO shapes are kept aligned through `openapi.yaml`.
- The planning artifacts written for agents (`docs/implementation/agents/`, parts of the specs) still
  mention NestJS/TypeORM; they are marked historical.
- CI builds and tests the back end on every push (`./mvnw verify`: Checkstyle, unit, integration, HTTP and
  concurrency tests with Testcontainers), and the compose job runs the whole stack.
- **Version drift to fix:** the integration tests run on `postgres:16-alpine` while compose runs PostgreSQL 17
  (`TestcontainersConfiguration`). Nothing used depends on the difference, but the test image should follow
  the deployed one.

## Trade-offs
JVM start-up and memory are heavier than Node (irrelevant at this scale); Hibernate's persistence context
needs care around bulk updates (handled by flushing/clearing — see ADR-008).

## Related
ADR-001, ADR-008, ADR-013, ADR-014; `backend/README.md`, `frontend/README.md`.
