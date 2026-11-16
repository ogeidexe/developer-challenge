# Test Matrix — Planned IDs → Implemented Tests

> The IDs below were defined during planning and are referenced by the specs and the traceability matrix.
> Each row now says which real test covers it, or that it is missing.
> Back end: `backend/src/test/java/com/example/purchase/…` — **written, not yet executed** (no JDK/Docker
> in the authoring environment). Front end: `frontend/cypress/e2e/…` — **green**, against the fake backend.

Legend: ✅ implemented · ◐ partially · ❌ missing.

## Unit tests (UT) — back end, no Spring

| ID | Scenario | Status | Implemented by |
|---|---|---|---|
| UT-01 | Create validation (title/items/neededBy) | ◐ | bean validation on `RequestDtos.RequestInput` + `PurchaseRequestService.validate`; no dedicated unit test |
| UT-02 | Money parse/format/total | ✅ | `MoneyAndCalendarTest` (parse, invalid inputs, exact totals) |
| UT-03 | Visibility matrix | ✅ | `AccessPolicyTest.draftsAreVisibleToTheOwnerOnlyAdminIncluded`, `approversSeeTheirCenterAdminSeesEverythingElse` |
| UT-04 | Chain value boundaries | ✅ | `ApprovalChainBuilderTest.buildsTheChainFromValueAndCategory` (1000.00 / 1000.01 / 10000.00 / 10000.01) |
| UT-05 | Chain SOFTWARE, ADMIN never twice | ✅ | `ApprovalChainBuilderTest` (SOFTWARE rows, `adminAppearsAtMostOnceAndAlwaysLast`) |
| UT-06 | Eligibility matrix | ✅ | `ApprovalPoliciesTest.Eligibility` |
| UT-07 | Segregation (self, duplicate, reset per version) | ✅ | `ApprovalPoliciesTest.Segregation` |
| UT-08 | Comment rule | ✅ | `ApprovalPoliciesTest.Comment` |
| UT-09 | Competence month in São Paulo | ✅ | `MoneyAndCalendarTest.competenceMonthUsesSaoPauloNotUtc`, `neededByMustBeStrictlyAfterTheBusinessToday` |
| UT-10 | Inbox predicate | ◐ | the inbox reuses `ApprovalPolicies` (tested); no test of `InboxService` itself |
| UT-11 | State machine, all §4.2 rows incl. invalid | ✅ | `RequestStateMachineTest` (every status × action) |
| UT-12 | Domain purity | ❌ | convention only (an ArchUnit test would make it executable) |
| UT-13 | Config validation | ❌ | `AppProperties` is `@Validated`; the JWT key-length check is in `SecurityConfig`; untested |
| UT-14 | Pagination/sort helpers | ❌ | `RequestSpecifications.parseSort`, `PageResponse.slice` untested |
| UT-15 | Problem detail mapping | ❌ | `GlobalExceptionHandler` untested |
| UT-16 | Ownership → 403 NOT_REQUEST_OWNER | ❌ | `RequestAccess.requireOwner`; untested at unit level |
| UT-17 | `allowedActions` matrix | ✅ | `AccessPolicyTest.allowedActionsPerCaller`, `anApproverWhoAlreadyDecidedAStepGetsNoDecisionButtons` |
| UT-18 | Event factory | ❌ | (no factory; `AuditService` builds events) |
| UT-19 | Idempotency hashing | ❌ | `IdempotencyService.hash` untested directly |
| UT-20 | Money overflow bounds | ◐ | `Math.*Exact` in `Money`; only the 13-digit input bound is tested |
| UT-21 | Budget below consumed | ❌ | `CostCenterService.setBudget`; covered in the UI by Cypress `07-admin` (fake backend) |
| UT-22 | Working copy wholesale replace | ◐ | exercised by `WorkflowIntegrationTest.returnEditResubmitCreatesV2AndKeepsV1Immutable` |
| UT-23 | Dashboard scope | ❌ | covered in the UI by Cypress `02-dashboard` (fake backend) |
| UT-24 | Health mapping | ❌ | Actuator's own health indicator |
| UT-25 | No password/hash in user DTOs | ◐ | structural: `AdminDtos.UserDto` has no such field; no test |
| UT-26 | JWT issue/verify | ❌ | `JwtService` untested |
| UT-27 | Password hashing | ❌ | Spring's `BCryptPasswordEncoder` (library) |
| UT-28 | User role/level/center rules | ❌ | `UserAdminService.validateProfile` untested |
| UT-29 | Step closing (REJECTED/RETURNED/CANCELLED + SKIPPED) | ◐ | `WorkflowIntegrationTest.rejectNeedsAMeaningfulCommentAndClosesTheChain`, `returnEditResubmit…` (RETURNED); Cypress cancel test |

## API tests (AT) — HTTP contract of the real back end

**All ❌** — no MockMvc/HTTP tests exist yet. Behaviorally, most rows are exercised in the browser
against the fake backend (Cypress), which validates the UI contract but **not** the Java controllers:

| ID | Scenario | Closest existing coverage |
|---|---|---|
| AT-01/02/03 | register, login, me | Cypress `01-login` |
| AT-04/05 | user admin guards/validation | Cypress `07-admin` (create user, level required) |
| AT-06/07 | create / edit request | Cypress `04-request-form`; integration tests (service level) |
| AT-08 | list filters/sort/paging | Cypress `03-request-list` |
| AT-09/10 | visibility 404, detail contract | `WorkflowIntegrationTest.draftsAreInvisibleEvenToAdmin`; Cypress `08-navigation` |
| AT-11 | comment rules | `WorkflowIntegrationTest.reject…`; Cypress `05-request-detail` |
| AT-12 | inbox | Cypress `06-inbox` |
| AT-13 | versions + history | `WorkflowIntegrationTest` (service level); Cypress `05-request-detail` |
| AT-14 | dashboard | Cypress `02-dashboard` |
| AT-15/16 | cost centers, budgets | Cypress `07-admin` |
| AT-17 | health | — |
| AT-18 | OpenAPI served at `/docs` | — |
| AT-19 | problem+json shape | — |
| AT-20 | `X-Request-Id` | — |
| AT-21 | 401 / 403 ordering | Cypress `01-login` (expired session) |

## Integration tests (IT) — real PostgreSQL

| ID | Scenario | Status | Implemented by (`WorkflowIntegrationTest`) |
|---|---|---|---|
| IT-01 | Full 3-step flow to APPROVED with consumption | ✅ | `fullThreeStepFlowReachesApprovedAndConsumesTheBudget` (also checks the event list) |
| IT-02 | Segregation of duties | ✅ | `segregationOfDuties` |
| IT-03 | BUDGET_EXCEEDED | ✅ | `budgetExceededKeepsTheRequestPendingAndOnlyAuditsTheAttempt` (status, lockVersion, step, consumed unchanged; failure event present) |
| IT-04 | Month without budget = zero | ✅ | `monthWithoutBudgetHasZeroBalance` |
| IT-05 | Return → edit → resubmit = v2, v1 preserved | ✅ | `returnEditResubmitCreatesV2AndKeepsV1Immutable` (also: segregation resets on v2) |
| IT-06 | Audit append-only at DB level | ✅ | `historyAndSnapshotsAreImmutableInTheDatabase` |
| IT-07 | UTC storage | ❌ | configured (`hibernate.jdbc.time_zone=UTC`, `Instant`), not tested |
| IT-08 | Migrations + seed on boot, rerun no-op | ◐ | Flyway runs for every integration context; the seed is disabled in tests and its rerun is untested |
| IT-09 | Idempotent create | ✅ | `idempotentCreateReplaysTheStoredResponse` (replay + one row + 409 on a different payload) |
| — | extra | ✅ | `rejectNeedsAMeaningfulCommentAndClosesTheChain`, `staleLockVersionIs409AndChangesNothing`, `draftsAreInvisibleEvenToAdmin` |

## Concurrency tests (CT)

| ID | Scenario | Status | Implemented by (`ConcurrencyIntegrationTest`) |
|---|---|---|---|
| CT-01 | Same step, two approvers (+ final step with R$ 800 left) | ✅ | `twoApprovalsOfTheSameStepExactlyOneWinsTheOtherGets409`, `sameFinalStepWithAlmostNoBudgetStillGives409NotBudgetExceeded` (each ×5) |
| CT-02 | Finals racing on one balance | ✅ | `finalApprovalsOfDifferentRequestsNeverOverdrawTheBudget` (5 × R$ 3.000 on R$ 10.000 → 3 approved, 2 × 422) |
| CT-03 | [D] transition idempotency | ❌ | differentiator, not implemented |
| CT-04 | Stale lockVersion on every transition | ◐ | `WorkflowIntegrationTest.staleLockVersionIs409AndChangesNothing` (approve only, sequential) |
| CT-05 | Parallel creates, same key | ❌ | only the sequential replay is tested (IT-09) |
| CT-06 | Budget PUT vs consumption | ❌ | the code takes a `PESSIMISTIC_WRITE` lock; no race test |

## Front-end tests (FT) — implemented as Cypress end-to-end tests

| ID | Scenario | Status | Implemented by |
|---|---|---|---|
| FT-01 | List page + URL state | ✅ | `03-request-list.cy.ts` (8 tests) |
| FT-02 | Actions from `allowedActions` | ✅ | `05-request-detail.cy.ts` › renders actions only from allowedActions |
| FT-03 | Detail: chain, versions, timeline | ✅ | `05-request-detail.cy.ts` (video flow, v1/v2 switch, timeline) |
| FT-04 | Comment modal (≥ 10 chars) | ✅ | `05-request-detail.cy.ts` › reject requires a comment… |
| FT-05 | 409 / 422 handling | ✅ | `05-request-detail.cy.ts` › BUDGET_EXCEEDED…, › 409: someone acted first… |
| FT-06 | Admin budget editor, below consumed | ✅ | `07-admin.cy.ts` › sets a monthly budget… |
| — | extra | ✅ | `01-login` (8), `02-dashboard` (3), `04-request-form` (5), `06-inbox` (5), `08-navigation` (5) |

No component-level tests (Vitest/RTL) exist; README §5.2's "≥ 3 significant front-end tests" is currently
met only by these end-to-end tests.

## Biggest gaps, in priority order

1. Run the back-end suites (`./mvnw verify`) and fix whatever fails.
2. HTTP-level tests of the controllers (status codes, `problem+json`, `X-Request-Id`, 401/403/404 order).
3. CT-05 (parallel same-key creates) and CT-06 (budget PUT vs consumption).
4. Front-end component tests if the evaluators expect unit-level front-end tests.
