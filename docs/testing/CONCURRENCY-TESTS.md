# Concurrency Test Specification

> The README (§2.3.5, §5.2) demands *automated* proof under races. These suites are exact — they assert
> winners, balances and response codes, never "eventually consistent" outcomes.

## CT-01 — Same step, two approvers (README §2.3.5 bullet 1)

**Setup (intermediate variant):** request R > R$10.000 (non-SOFTWARE) submitted → chain
[N1,N2,ADMIN]; race on the N1 step with two distinct eligible approvers (e.g. the center's NIVEL_1 and
NIVEL_2 approvers, both read the same `lockVersion=L`).
**Setup (mandatory final-step, low-budget variant):** a `SOFTWARE` request R of **R$700,00** — chain
`[N1, ADMIN]` per README §2.3 (≤ R$1.000 → N1; SOFTWARE appends ADMIN). Approve N1 first, then race the
**final ADMIN step** with the two seeded ADMINs (neither is the owner). The cost center's
competence-month budget is set to leave **R$800,00 available** (enough for exactly one consumption of
R$700), so a budget-first implementation would hand the loser 422 — the test proves it gets 409.
**Action:** fire both approvals concurrently with the same `lockVersion` L (start-gated threads calling `TransitionFacade.approve`), ≥ 30 iterations
per variant. **Each round uses a fresh request and resets the budget** (fresh cost center, or `PUT` the
month's amount back to `consumed + 800.00`) — otherwise round 2 starts with R$100 available and the
legitimate winner would get 422.
**Assert:**
- exactly one response 200, the other 409 `CONCURRENCY_CONFLICT` — **in both the intermediate and the
  final-step-low-budget variants** (the lock UPDATE is the first write, so the loser never reaches the
  budget check);
- `approval_steps` row for (v1, current seq) has exactly one decision — the 200 winner;
- request status advanced exactly once; balance consumed exactly once in the final variant;
- **no** `APPROVAL_FAILED_BUDGET` event exists for the loser (the losing tx rolled back entirely);
- no double event rows for the step (history shows a single decision).
**Mechanism under test:** conditional aggregate lock UPDATE (first write; READ COMMITTED re-evaluation)
+ step decision guard `WHERE status='PENDING'`.

## CT-02 — Finals racing on one balance (README §2.3.5 bullet 2)

**Setup:** one cost center, budget R$10.000 for the competence month; requests X and Y of R$7.000 each,
both submitted (same center, same month), both at their final step. Approvers are chosen per the normal
rules — note that segregation of duties applies **within one request's version**, so the *same* person
may approve the final step of two *different* requests; the race works with any valid approver pairing.
**Action:** run both finals concurrently; repeat 50 rounds.
**Assert:**
- sum of successful finals never exceeds the balance: `consumed_cents ≤ amount_cents` in every round,
  verified by raw SQL after both responses settle;
- exactly one of {X, Y} is APPROVED, the other 422 `BUDGET_EXCEEDED`;
- the 422 response `detail` contains available and required values;
- no negative balance at any checkpoint (assert inside a lock-free read after commit — `consumed_cents >= 0`).
**Determinism note:** the winner is whichever tx commits first — tests must accept either X or Y as winner.

## CT-03 — [D] Transition idempotency guard (optional differentiator)

**Setup:** enable the optional transition-key guard (FR-024) if implemented.
**Action:** retry `approve` with the same key+payload after success.
**Assert:** identical stored response; no second step mutation; history unchanged.

## CT-04 — Stale lockVersion on every transition type

**Setup:** request in each non-final state; two readers both hold `lockVersion=L`.
**Action:** first caller mutates (submit/edit/reject per case); second caller sends stale `L`.
**Assert for each of submit/approve/reject/request-changes/cancel/edit:** second gets 409 with
`currentLockVersion = L+1`; aggregate unchanged by the loser; no events from the loser.
**Also assert:** missing `lockVersion` in body → 400 `VALIDATION_FAILED` once the earlier stages
(401/404/403) pass.
**Ordering invariant:** the lock guard is the transaction's **first write**, so a stale-lock request
always gets 409 — it can never be preempted by a business 422 such as `BUDGET_EXCEEDED`.

## CT-05 — Parallel creates with the same Idempotency-Key

**Setup:** one user, key K, payload P. The key row is reserved inside the create transaction
(placeholder INSERT first — see TRANSACTION-STRATEGY §3.4).
**Action:** 8 concurrent `POST /requests` with (K,P).
**Assert:** all 8 responses are byte-identical to the first execution's 201; exactly one row in
`purchase_requests`; exactly one row in `idempotency_keys`; subsequent same-key-different-payload → 409
`IDEMPOTENCY_PAYLOAD_MISMATCH`; after forced expiry (test clock), key reusable.

## CT-06 — PUT budget vs concurrent consumption

**Setup:** budget amount R$10.000, consumed R$4.000; ADMIN sets amount R$4.500 while a final approval of
R$2.000 races.
**Action:** run both concurrently; 30 rounds alternating who starts first.
**Assert:** final state never has `consumed > amount`; if PUT wins the race, approval either fits the new
amount (200) or gets 422; if approval wins, PUT either succeeds (amount ≥ new consumed) or returns 422
`BUDGET_BELOW_CONSUMED`.

## Harness (as implemented)

- `ConcurrencyIntegrationTest` extends `IntegrationTest`: `@SpringBootTest` + Testcontainers
  `postgres:16-alpine`; every test starts from a `TRUNCATE` of all tables. Skipped without Docker.
- `race(List<Callable<T>>)` runs each task on its own platform thread (`Executors.newFixedThreadPool`),
  waits until all are ready (`CountDownLatch ready`), releases them together (`CountDownLatch go`) and
  collects a sealed `Attempt<T>` (`Success` / `Failure`) per task. No sleeps.
- Tasks call the application services (`TransitionFacade`) exactly as the controllers do — each call is
  its own transaction, so the row locks and conditional updates under test are real.
- Assertions accept any winner and check the invariant (counts of successes/conflicts, consumed amount,
  lockVersion advanced once, no `APPROVAL_FAILED_BUDGET` event for a 409 loser).

## Implementation status

| ID | State | Notes |
|---|---|---|
| CT-01 | written | both variants, `@RepeatedTest(5)` each (the doc above asks for ≥ 30 rounds — raise the repetitions once the suite runs) |
| CT-02 | written | one round of five R$ 3.000 finals on R$ 10.000 (expects 3 approved, 2 × `BUDGET_EXCEEDED`, consumed R$ 9.000) |
| CT-03 | not implemented | differentiator |
| CT-04 | partial | sequential stale-lock check for approve only (`WorkflowIntegrationTest`) |
| CT-05 | not implemented | needs a parallel variant of the idempotency test |
| CT-06 | not implemented | the code locks the budget row (`PESSIMISTIC_WRITE`) but no race test exists |

None of these tests has been executed yet (no JDK/Docker in the authoring environment).
