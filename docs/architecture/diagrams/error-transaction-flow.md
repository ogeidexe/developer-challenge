# Diagram — Error Handling and Transaction Flow (transition actions)

```mermaid
flowchart TD
    CALL[Transition endpoint called<br/>submit · approve · reject · request-changes · cancel] --> M1{AuthN OK?}
    M1 -->|no| E401[401 UNAUTHENTICATED]
    M1 -->|yes| M2{Aggregate exists<br/>& visible?}
    M2 -->|no| E404[404 NOT_FOUND]
    M2 -->|yes| M3{Role allows<br/>action type?}
    M3 -->|no| E403[403 FORBIDDEN]
    M3 -->|yes| M4{Actor may perform<br/>action type?}
    M4 -->|no| E403[403 FORBIDDEN]
    M4 -->|yes| M4b{Owner-only action?<br/>caller is the owner}
    M4b -->|no| E403B[403 NOT_REQUEST_OWNER]
    M4b -->|yes| TXBEGIN[/BEGIN tx/]
    TXBEGIN --> LOCKSTEP[aggregate lock UPDATE<br/>WHERE lock_version=:expected<br/>— first write]
    LOCKSTEP -->|0 rows| ROLL0[/ROLLBACK/] --> E409A[409 CONCURRENCY_CONFLICT<br/>+ currentLockVersion]
    LOCKSTEP -->|1 row| SM{State machine:<br/>valid transition?}
    SM -->|no| ROLL1[/ROLLBACK/] --> E422A[422 INVALID_TRANSITION]
    SM -->|yes| POL{Domain policies:<br/>eligibility · segregation · comment}
    POL -->|violation| ROLL2[/ROLLBACK/] --> E422B[422 specific code<br/>SELF_APPROVAL / DUPLICATE_APPROVER /<br/>APPROVER_NOT_ELIGIBLE / COMMENT_REQUIRED]
    POL -->|pass| LAST{Final step?}
    LAST -->|yes| BUD{Atomic budget UPDATE<br/>fits?}
    BUD -->|no| ROLL3[/"ROLLBACK everything<br/>(no lock bump)"/] --> EVTX[/NEW short tx:<br/>insert APPROVAL_FAILED_BUDGET event/] --> COMMITX[/COMMIT/] --> E422C[422 BUDGET_EXCEEDED<br/>status unchanged]
    BUD -->|yes| CONSUME[consumed_cents += total]
    LAST -->|no| STEP[mark step APPROVED<br/>WHERE status='PENDING'<br/>advance current step]
    CONSUME --> STATE[status → APPROVED]
    STEP --> EV[write audit events]
    STATE --> EV
    EV --> COMMIT[/COMMIT/] --> OK[200 + fresh lockVersion<br/>+ detail DTO]
    E401 & E404 & E403 & E409A & E422A & E422B & E422C --> PD["GlobalExceptionHandler<br/>(401 from the filter chain: ProblemResponses)<br/>→ application/problem+json<br/>type·title·status·detail·code·requestId"]

    classDef err fill:#ffebee,stroke:#e53935;
    class E401,E404,E403,E409A,E422A,E422B,E422C err
```

Key facts:
- The lock guard is the aggregate's conditional `lock_version` UPDATE — the **first write** inside the transaction. A racing second approver's UPDATE waits on the row lock and re-evaluates on the winner's commit → 0 rows → **409** (README §2.3.5: one succeeds, the other gets 409 — never a business 422).
- Owner-only actions (edit/submit by non-owner, cancel by non-owner non-ADMIN) fail with `403 NOT_REQUEST_OWNER` before the transaction opens.
- On `BUDGET_EXCEEDED` the transition transaction rolls back **everything** (including the lock bump); only the `APPROVAL_FAILED_BUDGET` audit event is written, in a separate short transaction.
- `409` precedes all business-rule checks (BR-014); every rejection path produces an explanatory `detail` message (BR-015).
