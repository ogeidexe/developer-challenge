# ADR-007 — Authorization Strategy: Authentication in the Filter Chain, Rules in the Services

**Status:** Accepted · revised 2026-11-18 to match the current implementation
**Date:** 2026-11-15

## Context
README mixes role checks (§1.1), ownership rules (§2.2), level/cost-center eligibility and segregation
(§2.3), and fixes the evaluation order (§4.3): 401 → 404 (visibility) → 403 (role) → 409 → 422.

## Problem
Decide where each authorization decision lives so it follows the §4.3 order, cannot be bypassed by a new
endpoint, and is unit-testable.

## Options Considered
1. URL/method rules in the security configuration (`hasRole`, `@PreAuthorize`) for every role check.
2. **Two tiers:** the filter chain only authenticates (401); visibility, role, ownership, eligibility and
   segregation run inside the services, in §4.3 order, using pure domain policies.
3. Everything in controllers.

## Decision
Option 2.
- `SecurityConfig`: public routes (`POST /auth/register`, `POST /auth/login`, `GET /health`,
  `GET /cost-centers`, `/docs`, `/swagger-ui/**`, `/v3/api-docs`); **everything else just requires a valid
  JWT with a live session** (ADR-006, ADR-015). 401/403 from the filter chain are written as `problem+json`
  by `ProblemResponses`. The Nginx gateway (ADR-016) routes and rate-limits; it makes no authorization decision.
- Services evaluate, in order:
  1. **404** — `RequestAccess.loadVisible` applies `AccessPolicy.canSee` (ADR-012);
  2. **403** — `RequestAccess.requireApproverRole` (`SOLICITANTE` never decides), `requireOwner`
     (`NOT_REQUEST_OWNER`), `requireAdmin` (admin endpoints);
  3. **409** — `RequestLock.claim` (ADR-009);
  4. **422** — `RequestStateMachine.require`, `ApprovalPolicies.requireEligible`,
     `requireSegregation`, `requireComment`, then the budget.
- The detail endpoint's `allowedActions` comes from `AccessPolicy.allowedActions`, which reuses the same
  policy functions — the inbox (`InboxService`) does too — so buttons, inbox and transitions cannot disagree.

## Rationale
A URL-level role rule (option 1) would answer 403 before the request is loaded, i.e. before visibility —
contradicting §4.3 and leaking existence (ADR-012). Keeping the rules in plain domain functions makes them
unit-testable without Spring Security, and every service path enforces them.

## Consequences
- `GlobalExceptionHandler` maps the sealed `DomainException` subtypes to 400/403/404/409/422.
- Admin checks live in services, not annotations — they are visible in the code paths they guard.
- The front end's route guards and menus are UX only: the role shown comes from the login response, so after
  a role change the menu updates at the next login while the API already applies the new role.

## Trade-offs
Role checks are not declared at the controller, so a reviewer must read the service (mitigated: every
service method starts with its access checks, in order).

## Verification
`HttpContractIntegrationTest#authenticationRoleAndVisibilityFailuresUseTheirStatusAndCode`, `AccessPolicyTest`,
`AdminServicesIntegrationTest#onlyAdminManagesUsersCostCentersAndBudgets`, and in `SecurityIntegrationTest`:
`aSolicitanteCannotDecideEvenARequestTheyCanSee`, `anApproverOfAnotherCostCenterSeesNothingAndCannotDecide`,
`anotherRequesterCannotReadEditSubmitOrCancelSomeoneElsesRequest`, `anApproverWhoCanSeeARequestStillCannotEditIt`.
Cypress checklist FLOW-02, FLOW-05 (401 → 404 → 403 → 409 → 422), LIST-03 and FE-04 (buttons = `allowedActions`).

## Related
ADR-006, ADR-009, ADR-012; `api/ERROR-CATALOG.md` §3.
