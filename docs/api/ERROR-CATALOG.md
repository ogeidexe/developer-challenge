# Error Catalog

> Every error response is `application/problem+json` (RFC 9457) with `type`, `title`, `status`,
> `detail` (human-readable, explains the reason — BR-015), `code` (machine-readable), `requestId`,
> optional `errors[]` (validation) and optional `currentLockVersion` (409 conflict).

## 1. Global shape

```json
{
  "type": "https://purchase-requests.example/problems/<slug>",
  "title": "Human title",
  "status": 422,
  "detail": "Explanatory message naming the concrete reason and context",
  "code": "BUDGET_EXCEEDED",
  "requestId": "b7e1c0d2-...",
  "errors": [ { "field": "items[0].quantity", "message": "must be a positive integer", "code": "INVALID" } ]
}
```

## 2. Status/code catalog

| HTTP | code | When | Example detail |
|---|---|---|---|
| 400 | `VALIDATION_FAILED` | Schema/field validation (also carries `errors[]`) | `"One or more fields are invalid."` + per-field errors |
| 400 | `INVALID_SORT` | sort field/direction not in whitelist | `"Unknown sort field 'foo'. Allowed: createdAt, title, total, status, submittedAt."` |
| 400 | `INVALID_MONTH_FORMAT` | `yyyy-mm` path param malformed | `"Month must be formatted as yyyy-mm, got '2026-13'."` |
| 401 | `UNAUTHENTICATED` | missing/invalid/expired JWT | `"Missing or expired authentication token."` |
| 403 | `FORBIDDEN` | role cannot perform the action type | `"SOLICITANTE cannot approve requests."` / `"Only ADMIN can manage users."` |
| 403 | `NOT_REQUEST_OWNER` | edit/submit by non-owner, or cancel by a non-owner non-ADMIN (A-27) | `"Only the request owner can edit this request."` |
| 404 | `NOT_FOUND` | resource absent **or outside caller visibility** (ADR-012) | `"Request not found."` |
| 409 | `CONCURRENCY_CONFLICT` | stale `lockVersion` on any transition/edit | `"Request was modified concurrently. Current lockVersion: 8."` + `currentLockVersion` |
| 409 | `IDEMPOTENCY_PAYLOAD_MISMATCH` | `Idempotency-Key` reused with a different payload | `"Idempotency-Key was already used with a different payload."` |
| 409 | `EMAIL_ALREADY_REGISTERED` | register/create user with existing email | `"Email already registered."` |
| 409 | `CODE_ALREADY_USED` | cost-center code duplicated | `"Cost-center code 'CC-TI-01' already exists."` |
| 422 | `INVALID_TRANSITION` | state machine rejects the action | `"Cannot approve: request is in status DRAFT."` |
| 422 | `SELF_APPROVAL_FORBIDDEN` | approver is the owner | `"Não é possível aprovar: você é o solicitante desta solicitação (segregação de funções)."` |
| 422 | `DUPLICATE_APPROVER` | same person approved another step of this version | `"Não é possível aprovar: você já aprovou a etapa NIVEL_1 desta versão (segregação de funções)."` |
| 422 | `APPROVER_NOT_ELIGIBLE` | role/level/cost-center mismatch for the step | `"Não é possível aprovar: etapa NIVEL_2 exige APROVADOR NIVEL_2 do centro de custo CC-TI-01 ou ADMIN."` |
| 422 | `COMMENT_REQUIRED` | reject/request-changes without ≥10-char comment | `"Comment is required (min 10 characters) when rejecting or requesting changes."` |
| 422 | `BUDGET_EXCEEDED` | final approval exceeds available balance (or month without budget) | `"O centro de custo CC-TI-01 tem R$ 8.200,00 disponíveis em 2026-11; a solicitação exige R$ 24.499,50."` |
| 422 | `BUDGET_BELOW_CONSUMED` | PUT budget below already consumed | `"Cannot set budget below consumed amount (consumed R$ 49.200,00)."` |
| 413 | `PAYLOAD_TOO_LARGE` | request body above `MAX_REQUEST_BODY` (default 1 MiB), any route — SEC-F03 | `"O corpo da requisição excede o limite de 1048576 bytes."` |
| 429 | `TOO_MANY_REQUESTS` | `POST /auth/login` after too many failures for the account or client (header `Retry-After`) — SEC-F01 | `"Muitas tentativas de login. Tente novamente em 840 s."` |
| 500 | `INTERNAL` | unexpected error (details only in logs — NFR-024) | `"Unexpected error. Correlation id: <requestId>."` |

## 3. Verification order → status mapping (normative)

For every request the pipeline evaluates in this exact order; the first failure wins (BR-014):

1. **401** — JWT missing/invalid/expired (security filter chain, before any controller).
2. **404** — aggregate not found **or not visible** to the caller (load-time visibility, ADR-012). Drafts are invisible to everyone except the owner — `ADMIN` included (A-26).
3. **403** — caller's role cannot perform this *action type* (`FORBIDDEN`); or the resource belongs to another user and the action is owner-only (`NOT_REQUEST_OWNER`, A-27). Both precede lock/business checks.
4. **409** — `lockVersion` mismatch (`RequestLock.claim`, the first write, before any business rule); idempotency-payload conflicts on `POST /requests` also surface here.

> Implementation note: request-body validation (`@Valid`, e.g. a missing `lockVersion` or a malformed
> price) runs before the controller method, so a structurally invalid body gets **400 before stages 2–4**.
5. **422** — business rules, in this order:
   a. `INVALID_TRANSITION` (state machine),
   b. `APPROVER_NOT_ELIGIBLE` (role/level/cost center — README §4.3 "nível, centro de custo"),
   c. `SELF_APPROVAL_FORBIDDEN`, then `DUPLICATE_APPROVER` ("segregação"),
   d. `COMMENT_REQUIRED` (min 10 chars — enforced by CommentPolicy, **not** by request-schema validation, so an optional approve comment of `"OK"` stays legal; see API-DESIGN §5),
   e. `BUDGET_EXCEEDED`.

> Pagination is **clamped**, not rejected: `page < 0 → 0`, `size` outside 1–100 → clamped (A-30).

## 4. Front-end rendering contract

| Status | UX requirement (README §2.7) |
|---|---|
| 400 | map `errors[]` onto form fields; summary banner otherwise |
| 401 | clear session → `/login?returnUrl=<current>` → restore route after login |
| 403 | `FORBIDDEN`: hide the whole action family (role cannot do this action type). `NOT_REQUEST_OWNER`: "not your request" inline message — hide owner-only affordances (edit/submit/cancel) |
| 404 | "not found" screen; on lists, silently drop stale rows |
| 409 | conflict banner: *"Alguém agiu antes de você"* → refetch detail, update `lockVersion`, re-render `allowedActions` |
| 422 | business banner with `detail` text; keep user input; for forms, merge `errors[]` when present |
| 500 | generic error state with correlation id |

## 5. Extending the catalog

New business rules must add a row here **and** to `openapi.yaml` (response descriptions) **and** to
`TEST-MATRIX.md` before implementation. Codes are part of the public contract — never rename, only deprecate.
