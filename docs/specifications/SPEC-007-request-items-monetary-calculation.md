# SPEC-007 — Request Items & Monetary Calculation

## 1. Specification Metadata
- **ID:** SPEC-007 · **Feature:** Money value object + item calculation · **Version:** 1.0
- **Priority:** P0 · **Complexity:** S (2–3 h) · **Dependencies:** SPEC-006 (executed by the same agent, Wave 2) · **Wave:** 2
- **Responsible agent:** AGENT-SPEC-006 · **Status:** implemented — drafted in `backend/` — not yet compiled or run

> **Implementation note (2026-11-15):** §6 describes what was built. The task plan (§9) and the test
> IDs are the original plan — their real status is in `docs/testing/TEST-MATRIX.md`; the stack change
> (NestJS → Spring Boot, plain React → Ant Design) is recorded in ADR-002.

## 2. Business Context
README §2.2: totals are computed **in the back-end** (`quantity × unitPrice` per item, summed; BRL);
client-sent totals are ignored; representation/rounding is the candidate's decision (ADR-005: integer cents).

## 3. Scope
**In:** `Money` value object (bigint cents, BRL-only); `MoneyCalculator.total(items)`; parsing/formatting
(decimal string ⇄ cents); validation bounds (unitPrice > 0, ≤ 13 integer digits, ≤ 2 fraction digits; quantity 1..1 000 000).
**Out:** storage (SPEC-002 schema already cents); budget math (SPEC-011 reuses `Money`).

## 4. Requirements
FR-007 · FR-008 (items) · DATA-005 · NFR-020 (serialization)

## 5. Business Rules
- Line total = quantity × unitPrice, computed once at write; `line_total_cents` CHECK enforces consistency.
- Total = Σ line totals (bigint; overflow beyond int64 practically impossible given bounds).
- Rounding: none needed — inputs carry ≤ 2 fraction digits; all math is exact integer.
- Any client-sent `total`/`lineTotal` field is ignored (not an error; not echoed).

## 6. Architecture (as implemented)
`domain.Money` (record of `long cents`: `parse`, `plus`, `minus`, `times` with `Math.*Exact`, `toDecimalString`, `toBrl`); line totals computed when building `RequestItemEntity` (DB `CHECK` enforces `line_total = qty × price`); request total = `Money.sum`. Prices arrive as decimal strings validated by `^\d{1,13}(\.\d{1,2})?$`; a zero price → 400.

## 7. API Contract
`ItemDto.unitPrice/lineTotal` and all money fields serialize per `Money` schema in `openapi.yaml` (`^\d{1,13}\.\d{2}$`).

## 8. Database Impact
None new (columns already `bigint`).

## 9. Implementation Plan
| Task | Output | Validates |
|---|---|---|
| T01 `Money` + property tests (parse/format round-trip, exactness) | VO | UT-02 |
| T02 `MoneyCalculator` table tests (boundaries: 0.01, 9999999999999.99, max qty) | totals | UT-02 |
| T03 Wire into SPEC-006 create/update; serializer in DTO mapper | end-to-end | AT-06/07 |

## 10. Testing Strategy
Property-based (fast-check): parse(format(x)) == x for all valid cents; totals never lose cents across
random item sets; boundary table (0.01×1; 999999999.99×1000000; mixed sets).

## 11. Acceptance Criteria
- **G**iven items `[{qty:5, price:"4899.90"}]` **W**hen computing total **T**hen `"24499.50"` exactly (no float artifacts).
- **G**iven a payload containing `"total": "99999999.00"` **W**hen creating a request **T**hen the field is ignored and the response total reflects computed items.

## 12. Integration Requirements
`Money` is the only money representation — SPEC-011 (budgets) and SPEC-014 (dashboard) must reuse it.

## 13. Risks
None significant; pure module.

## 14. Definition of Done
Property + table tests green; AT-06/07 assert exact totals; AI-logged.
