# Traceability Matrix — Requirement → Code → Test

> Requirement IDs: `REQUIREMENTS.md`. Back-end classes are under `backend/src/main/java/com/example/purchase/`
> (package shown); back-end tests under `backend/src/test/java/...` (**written, not yet executed**);
> front-end E2E specs under `frontend/cypress/e2e/` (**green**, against the in-browser fake backend).
> Planned test IDs (UT/IT/CT/FT/AT) and their status: `testing/TEST-MATRIX.md`.

## 1. Functional requirements and business rules

| Requirement | Back-end implementation | Back-end test | Front-end / E2E |
|---|---|---|---|
| FR-001, SEC-006 register → always SOLICITANTE | `application.AuthService.register` | — | `01-login` › public registration |
| FR-002 login, 15-min JWT, claims | `security.JwtService`, `application.AuthService.login` | — | `01-login` › signs in |
| FR-003 `GET /auth/me` | `AuthService.me`, `api.AdminController` | — | `AuthContext` |
| FR-004, SEC-005 BCrypt, hash never returned | `SecurityConfig.passwordEncoder`; `AdminDtos.UserDto` has no hash field | — | — |
| FR-005, SEC-004 admin manages users | `application.UserAdminService` | — | `07-admin` › creates an APROVADOR |
| FR-006/007 request fields, category enum | `api.dto.RequestDtos.RequestInput`, `PurchaseRequestService.validate` | integration tests create requests | `04-request-form` |
| FR-008 total computed server-side | `domain.Money`, `PurchaseRequestService` | `MoneyAndCalendarTest` | `04-request-form` › live (display-only) total |
| FR-009, BR-017 edit only owner, only DRAFT/CHANGES_REQUESTED | `PurchaseRequestService.update`, `RequestAccess.requireOwner` | `WorkflowIntegrationTest.returnEditResubmit…` | `04-request-form` › edits a draft |
| FR-010, NFR-019/023 list, paging, sort, filters | `RequestQueryService.list`, `RequestSpecifications` | — | `03-request-list` |
| FR-011, BR-013 visibility (drafts: owner only, ADMIN included) | `domain.AccessPolicy.canSee`, `RequestSpecifications.visibleTo`, `RequestAccess.loadVisible` | `AccessPolicyTest`, `WorkflowIntegrationTest.draftsAreInvisibleEvenToAdmin` | `03-request-list`, `08-navigation` |
| FR-012 [D] min/max amount, `q` | `RequestSpecifications.matching` | — | `03-request-list` › searches by title |
| FR-013/014, BR-004 chain by value | `domain.ApprovalChainBuilder` | `ApprovalChainBuilderTest` | `05-request-detail` › video flow |
| FR-015, BR-005 SOFTWARE ends with ADMIN | `ApprovalChainBuilder` | `ApprovalChainBuilderTest` | `05-request-detail` › SOFTWARE under R$ 1.000 |
| FR-016 eligibility | `domain.ApprovalPolicies.isEligible/requireEligible` | `ApprovalPoliciesTest.Eligibility` | `06-inbox` |
| FR-017, BR-001/002 segregation | `ApprovalPolicies.requireSegregation` | `ApprovalPoliciesTest.Segregation`, `WorkflowIntegrationTest.segregationOfDuties` | `06-inbox` › segregation of duties |
| FR-018, BR-003 comment ≥ 10 on reject/return | `ApprovalPolicies.requireComment` | `ApprovalPoliciesTest.Comment`, `WorkflowIntegrationTest.reject…` | `05-request-detail` › reject requires a comment |
| FR-019, BR-006/007 consumption in the version's competence month | `TransitionService.decide/consumeBudget`, `BudgetRepository.consume`, `domain.BusinessCalendar` | `WorkflowIntegrationTest.fullThreeStepFlow…`, `MoneyAndCalendarTest` | `05-request-detail` › budget consumed |
| FR-020, BR-008 no budget = zero; insufficient → 422, stays pending | `TransitionService.consumeBudget`, `TransitionFacade` | `WorkflowIntegrationTest.budgetExceeded…`, `monthWithoutBudgetHasZeroBalance` | `05-request-detail` › BUDGET_EXCEEDED |
| FR-021, BR-009, DATA-001/002 never negative under concurrency; same step → 409 | `RequestLock.claim`, `BudgetRepository.consume`, `ApprovalStepRepository.decide` | `ConcurrencyIntegrationTest` (3 tests) | `05-request-detail` › 409 |
| FR-022, BR-010, DATA-003 resubmit = new version, old one immutable | `TransitionService.submit`, `@Immutable` version entities, Flyway `V5` triggers | `WorkflowIntegrationTest.returnEditResubmit…`, `historyAndSnapshots…` | `05-request-detail` › return → edit → resubmit creates v2 |
| FR-023 no eligible approver = stays pending | inbox/allowedActions simply show nothing | — | — |
| FR-024 [D] transition idempotency | not implemented | — | — |
| FR-025 inbox | `application.InboxService` | — | `06-inbox` |
| FR-026/027, BR-011, DATA-004 append-only history | `AuditService`, `RequestEventEntity` (`@Immutable`), Flyway `V5` | `WorkflowIntegrationTest.historyAndSnapshots…` (+ event list in IT-01) | `05-request-detail` (timeline) |
| FR-028/029 dashboard | `application.DashboardService` | — | `02-dashboard` |
| FR-030 [D] average approval time | `DashboardService.averageApprovalDays` (first submission, A-29) | — | `02-dashboard` |
| FR-031 login, protected routes, 401 → back to route | front end `AuthContext`, `App.tsx` | — | `01-login`, `08-navigation` |
| FR-032…039 UI screens | `frontend/src/features/*` | — | one spec per screen (`01`–`08`) |
| FR-037 actions only from `allowedActions` | `domain.AccessPolicy.allowedActions`, `RequestMapper.detail` | `AccessPolicyTest.allowedActionsPerCaller` | `05-request-detail` › renders actions only from allowedActions |
| FR-040 admin screens (optional) | `frontend/src/features/admin/AdminPage.tsx` | — | `07-admin` |
| FR-041…063 endpoints | `api.RequestController`, `WorkflowController`, `AdminController`; `/health` via Actuator | — (no HTTP tests) | via the fake backend |
| FR-064, INT-003 OpenAPI in-app | springdoc (`/docs`, `/v3/api-docs`) | — | — |
| BR-012 neededBy in the future | `BusinessCalendar.isFuture`, `PurchaseRequestService.validate` | `MoneyAndCalendarTest.neededByMustBeStrictlyAfter…` | form disables past dates |
| BR-014 verification order | `RequestAccess` → `RequestLock` → policies; filter chain for 401 | partially (`staleLockVersionIs409…`) | — |
| BR-015 explanatory messages | messages in `ApprovalPolicies`, `RequestStateMachine`, `TransitionService` | asserted in `ApprovalPoliciesTest`, `RequestStateMachineTest`, `budgetExceeded…` | `05-request-detail` (422 detail shown) |
| BR-016, BR-018 final states, cancel from 3 states | `domain.RequestStateMachine`, `TransitionService.cancel` | `RequestStateMachineTest` | `05-request-detail` › cancels |

## 2. Non-functional, security, data

| Requirement | Implementation | Verified by |
|---|---|---|
| NFR-001/002 Java Spring Boot + PostgreSQL | `backend/pom.xml` | build (not yet run) |
| NFR-003 migrations + automatic seed | Flyway `V1`–`V6`; `config.DemoSeed` | integration context runs Flyway; seed untested |
| NFR-004 domain isolated | package `domain` (plain Java) | unit tests run without Spring |
| NFR-005 UTC | `Instant` + `hibernate.jdbc.time_zone=UTC` | — |
| NFR-006 explicit transactions + concurrency ADR | `@Transactional` services; ADR-008/009 | `ConcurrencyIntegrationTest` |
| NFR-007 JSON logs + `X-Request-Id` | ECS structured logging; `api.RequestIdFilter` | — |
| NFR-008, SEC-007 config via env, no secrets | `application.yml` placeholders; `JWT_SECRET` required (≥ 32 bytes) | — |
| NFR-009/010/011 compose, `.env.example`, CI | `.env.example` exists; **compose and CI missing** | — |
| NFR-013…017 tests | see `testing/TEST-MATRIX.md` | — |
| NFR-018, NFR-024 problem+json, no internals | `api.GlobalExceptionHandler`, `security.ProblemResponses` | — |
| NFR-020 ISO-8601 dates | Jackson defaults (`Instant`, `LocalDate`) | — |
| NFR-021 lockVersion on transitions | `RequestDtos.TransitionInput` (`@NotNull`), `RequestLock` | `staleLockVersionIs409…` |
| NFR-022, DATA-007 idempotent create | `application.IdempotencyService`, `idempotency_keys` | `WorkflowIntegrationTest.idempotentCreate…` |
| SEC-001/002/003 authn, 401, role checks | `security.SecurityConfig`, `CurrentUser`, `RequestAccess` | `01-login` (UI, fake backend) |
| DATA-005 exact money | `domain.Money` (cents, `Math.*Exact`) | `MoneyAndCalendarTest` |
| DATA-006 only valid transitions | `domain.RequestStateMachine` | `RequestStateMachineTest` |
| DATA-008/009 steps ordered, decided once; chain deterministic | `ApprovalStepRepository.decide` (status-guarded); `ApprovalChainBuilder` | `ConcurrencyIntegrationTest`, `ApprovalChainBuilderTest` |
| INF-004, SUB-* repository rules | allowed paths only; hooks untouched | repository audit |

## 3. Risks and evaluation traps

| Risk / trap | Mitigation in the code |
|---|---|
| Value boundary precision (R$ 1.000,00 vs 1.000,01; R$ 10.000,00) | integer cents; boundary rows in `ApprovalChainBuilderTest` |
| `lockVersion` confused with the request version (v1, v2…) | separate columns/fields (`lock_version` vs `current_version`); `lock_version` read-only for Hibernate |
| Competence month near midnight / month edges | `BusinessCalendar` with injected `Clock`; edge tests in `MoneyAndCalendarTest` |
| Same-step race answering 422 instead of 409 | lock claim is the first write; `sameFinalStepWithAlmostNoBudget…` |
| Budget overdraw under concurrency | conditional UPDATE + `CHECK`; `finalApprovalsOfDifferentRequests…` |
| History tampering | `@Immutable` entities + DB triggers; `historyAndSnapshots…` |
| Draft leakage (incl. to ADMIN) | one visibility rule for detail, list and dashboard |
| 403 vs 404 | ADR-012; `RequestAccess` runs visibility before role checks |
| Message quality graded (§4.3) | messages name the step, center, amounts; asserted in unit tests |
| Idempotency replay must return the stored response | stored JSON replayed verbatim; checked in `idempotentCreate…` |
| The fake backend drifting from the real API | both follow `openapi.yaml`; retire the fake once compose runs the real API |
| Back end never compiled | first action for the next session: `./mvnw verify` |
