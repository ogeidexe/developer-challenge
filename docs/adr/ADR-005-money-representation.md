# ADR-005 — Money Representation: Integer Cents

**Status:** Accepted · reviewed 2026-11-18 against the implementation
**Date:** 2026-11-15

## Context
README §2.2: "Como representar, armazenar e arredondar valores monetários fica a seu critério"; totals
are computed server-side in BRL; the example shows `"unitPrice": "4899.90"`.

## Problem
Choose a representation with exact arithmetic, safe storage and a contract-compatible serialization.

## Options Considered
1. **Integer cents** (`bigint`) everywhere; serialize as decimal string with 2 fraction digits.
2. `numeric(15,2)` in DB + `BigDecimal` in code.
3. Float/number (rejected immediately: binary rounding).

## Decision
Option 1. Columns `*_cents bigint`; domain `Money` record (`domain/Money.java`: `parse`, `plus`,
`times` with `Math.*Exact` overflow checks, `toDecimalString`, `toBrl`); JSON strings `"4899.90"`; inputs
validated with `^\d{1,13}(\.\d{1,2})?$`. The front end formats for display only (`moneyBRL`).

## Rationale
BRL in this domain needs exactly 2 fraction digits; integer arithmetic is exact, fastest and
unambiguous at every layer (DB CHECKs, optimistic UPDATEs, conditional consumption all stay integer).
Serialization matches the README's example format, keeping the OpenAPI contract clean. `numeric` would
work, but `BigDecimal` scale/equality pitfalls (`2.0` vs `2.00`) buy nothing at a fixed 2 decimal places.

## Consequences
- No rounding logic exists (inputs ≤ 2dp by validation; products of integers are exact).
- All comparisons/filters (min/maxAmount) operate on cents — converted at the API boundary only.
- The form only helps the user (the unit price input never keeps a zero, the live total is display only);
  the server recomputes every total and ignores any `total` the client sends.

## Trade-offs
Display formatting (pt-BR) is a front-end concern; 13-integer-digit bound caps amounts at ~R$9.9 trilhão — far beyond scope.

## Verification
`MoneyAndCalendarTest` (exact parsing, invalid amounts, exact totals), `SecurityIntegrationTest#theClientCannotChooseTheTotal`,
`ApprovalChainBuilderTest` (cent boundaries of the chain). Cypress checklist REQ-01 (a client `total` is ignored; the
server total is shown) and CHAIN-01 (R$ 1.000,00 / 1.000,01 / 10.000,01), in both suites.

## Related Specifications
SPEC-007, SPEC-011, SPEC-014; DATA-005.
