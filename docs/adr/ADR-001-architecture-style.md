# ADR-001 — Architecture Style: Modular Monolith with a Pure Domain Layer

**Status:** Accepted · revised 2026-11-15 to match the Java implementation
**Date:** 2026-11-15

## Context
The challenge (README §1–5) requires a purchase-request module with strong domain rules, transactional
consistency, a relational DB, a web UI and a 7-day window. No distribution, scaling or team-topology
requirements exist. README §5.1 explicitly asks that "a máquina de estados e a montagem da cadeia de
aprovação devem ser testáveis sem subir servidor ou banco".

## Problem
Choose an architecture that maximizes correctness and testability without paying distributed-systems or
over-engineering costs.

## Options Considered
1. **Modular monolith** with layers: a pure domain, transactional application services, persistence and web adapters.
2. **Hexagonal/Clean Architecture** fully applied (a port interface for every repository, framework isolation everywhere).
3. **Microservices** (requests, approvals, budgets, users).

## Decision
Option 1. One Spring Boot application (`backend/`) with one package per layer:

| Package | Contents | May depend on |
|---|---|---|
| `domain` | state machine, chain builder, approval/access policies, `Money`, `BusinessCalendar`, sealed `DomainException` — **plain Java, no Spring/JPA/HTTP imports** | nothing |
| `persistence` | JPA entities and Spring Data repositories (incl. the concurrency SQL) | `domain` |
| `application` | transactional use-case services, queries, idempotency, mapping to DTOs | `domain`, `persistence`, `api.dto` |
| `security` | JWT issue/verify, filter chain, current-user resolution | `persistence`, `config` |
| `api` | controllers, request/response records, exception handler, request-id filter | `application`, `security` |
| `config` | typed properties, clock/calendar beans, demo seed | all |

Ports-and-adapters is applied only where it pays: the domain receives plain values (`Actor`, `StepState`,
`AccessPolicy.RequestView`) instead of entities, so it never sees JPA. Repositories are used directly by
the services (Spring Data interfaces already are the port); no extra interface layer.

## Rationale
A pure domain package gives README §5.1 directly — the domain unit tests run in milliseconds with no
Spring context. Microservices would split the one transaction that matters (lock + budget + step + event)
and blow the deadline. Full hexagonal (a hand-written port per repository) adds indirection with no
second adapter to justify it.

## Consequences
- State machine, chain builder and policies are tested as plain JUnit tests (`src/test/java/.../domain`).
- One deployable keeps `docker compose` trivial.
- Layer discipline is by package convention and review; there is no ArchUnit rule yet (cheap to add).

## Trade-offs
Less isolation than microservices (irrelevant here); services depend on Spring Data directly, so swapping
the persistence technology would touch the services (accepted — not a requirement).

## Related
ADR-002 (stack), ADR-003 (boundaries), ADR-008 (transactions); `architecture/OVERVIEW.md`.
