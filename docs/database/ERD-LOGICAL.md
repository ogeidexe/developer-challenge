# Logical ERD

> Attribute-level model (types shown PostgreSQL-logical; sizes/constraints fully specified in
> ERD-PHYSICAL.md). Mermaid erDiagram with keys and cardinalities.

```mermaid
erDiagram
    USERS ||--o{ PURCHASE_REQUESTS : owner_id
    COST_CENTERS ||--o{ USERS : cost_center_id
    COST_CENTERS ||--o{ BUDGETS : ""
    COST_CENTERS ||--o{ PURCHASE_REQUESTS : ""
    PURCHASE_REQUESTS ||--o{ REQUEST_ITEMS : ""
    PURCHASE_REQUESTS ||--o{ REQUEST_VERSIONS : ""
    PURCHASE_REQUESTS ||--o{ REQUEST_EVENTS : ""
    USERS ||--o{ REQUEST_VERSIONS : submitted_by
    REQUEST_VERSIONS ||--o{ VERSION_ITEMS : ""
    REQUEST_VERSIONS ||--o{ APPROVAL_STEPS : ""
    USERS ||--o{ APPROVAL_STEPS : approver_id
    USERS ||--o{ REQUEST_EVENTS : actor_id
    USERS ||--o{ IDEMPOTENCY_KEYS : ""

    USERS {
        uuid id PK
        string email UK
        string password_hash
        string name
        enum role "SOLICITANTE|APROVADOR|ADMIN"
        enum approver_level "NIVEL_1|NIVEL_2 (APROVADOR only)"
        uuid cost_center_id FK "null = global admin"
        bool active
        int lock_version
        timestamptz created_at
        timestamptz updated_at
    }
    COST_CENTERS {
        uuid id PK
        string code UK
        string name
        bool active
        timestamptz created_at
        timestamptz updated_at
    }
    BUDGETS {
        uuid id PK
        uuid cost_center_id FK
        string year_month "yyyy-mm, UK with cc"
        bigint amount_cents ">= 0"
        bigint consumed_cents ">= 0, <= amount_cents"
        timestamptz created_at
        timestamptz updated_at
    }
    PURCHASE_REQUESTS {
        uuid id PK
        string request_number UK
        uuid owner_id FK
        uuid cost_center_id FK
        enum status "DRAFT|PENDING_APPROVAL|CHANGES_REQUESTED|APPROVED|REJECTED|CANCELLED"
        int current_version "frozen versions count"
        int lock_version "optimistic"
        string title
        text description
        enum category "EQUIPMENT|SERVICES|SUPPLIES|TRAVEL|SOFTWARE|OTHER"
        date needed_by
        bigint total_cents ">= 0"
        timestamptz submitted_at
        timestamptz decided_at
        timestamptz created_at
        timestamptz updated_at
    }
    REQUEST_ITEMS {
        uuid id PK
        uuid request_id FK
        int position "UK(request_id)"
        string description
        int quantity "> 0"
        bigint unit_price_cents "> 0"
        bigint line_total_cents "> 0"
    }
    REQUEST_VERSIONS {
        uuid id PK
        uuid request_id FK "UK(request_id, version_number)"
        int version_number "> 0"
        string title
        text description
        enum category
        uuid cost_center_id FK "frozen snapshot — budget charges this center (A-28)"
        date needed_by
        bigint total_cents
        string competence_month "yyyy-mm (America/Sao_Paulo at submit)"
        uuid submitted_by FK
        timestamptz submitted_at
    }
    VERSION_ITEMS {
        uuid id PK
        uuid version_id FK "UK(version_id, position)"
        int position
        string description
        int quantity
        bigint unit_price_cents
        bigint line_total_cents
    }
    APPROVAL_STEPS {
        uuid id PK
        uuid version_id FK "UK(version_id, sequence)"
        int sequence "> 0"
        enum level "NIVEL_1|NIVEL_2|ADMIN"
        enum status "PENDING|APPROVED|REJECTED|RETURNED|CANCELLED|SKIPPED (A-31)"
        uuid approver_id FK
        timestamptz decided_at
        text comment
    }
    REQUEST_EVENTS {
        bigint id PK "identity"
        uuid request_id FK
        uuid actor_id FK "null = system"
        enum actor_role
        string action
        enum from_status
        enum to_status
        enum step_level
        int step_sequence
        int version_number
        text comment
        string x_request_id
        timestamptz occurred_at "UTC"
    }
    IDEMPOTENCY_KEYS {
        uuid user_id FK "PK(user_id, idem_key)"
        string idem_key
        string endpoint
        string payload_hash "sha256"
        int response_status
        jsonb response_body
        timestamptz created_at
        timestamptz expires_at
    }
```

## Relationship rules (logical)

| # | Rule |
|---|---|
| R1 | A `USERS.cost_center_id` is NULL **only** for global `ADMIN`s (asserted by application; column stays nullable) |
| R2 | `BUDGETS` unique (cost_center_id, year_month); deleting a cost center is forbidden while budgets/requests reference it (RESTRICT) |
| R3 | `PURCHASE_REQUESTS.current_version` = max `REQUEST_VERSIONS.version_number`; 0 when never submitted |
| R4 | `REQUEST_ITEMS` are replaced wholesale (DELETE+INSERT in tx) on every working-copy edit |
| R5 | `APPROVAL_STEPS` ordered by (version_id, sequence); current step = first PENDING; statuses ∈ PENDING/APPROVED/REJECTED/RETURNED/CANCELLED/SKIPPED — reject marks the current step REJECTED, request-changes RETURNED, cancel CANCELLED; later steps become SKIPPED in the same tx (A-31) |
| R6 | `REQUEST_EVENTS` have **no** update/delete path; FKs are the only mutable-reference risk and they point to immutable identities |
| R7 | `IDEMPOTENCY_KEYS` rows are insert-only; lazy purge deletes only expired rows |

## Normalization assessment

- All tables are in 3NF: no transitive dependencies (statuses/enums as checks, not lookup tables — they are closed sets fixed by the challenge).
- Denormalization, deliberate and documented:
  - `PURCHASE_REQUESTS.total_cents` duplicates current-version total → avoids a join for list filters/sort (minAmount/maxAmount) — single-writer invariant (only submit/edit rewrite it).
  - `REQUEST_VERSIONS.cost_center_id` freezes the billing center per version (A-28) → a working-copy CC change can never rewrite a frozen version's budget attribution.
  - `REQUEST_EVENTS` carries `actor_role`, statuses, step and version **by value** → audit stability.
  - `BUDGETS.consumed_cents` is a maintained counter → O(1) balance checks with atomic conditional UPDATE; source events remain in `REQUEST_EVENTS` for reconciliation.
