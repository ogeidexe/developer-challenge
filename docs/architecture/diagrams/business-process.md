# Diagram — Main Business Process (happy path > R$10.000, non-SOFTWARE)

```mermaid
flowchart TD
    START([Owner creates request]) --> DRAFT[DRAFT<br/>working copy + items<br/>total computed server-side]
    DRAFT --> SUBMIT[POST /submit]
    SUBMIT --> V1[Freeze version v1<br/>competence_month stamped<br/>chain NIVEL_1 → NIVEL_2 → ADMIN built]
    V1 --> P1[PENDING_APPROVAL<br/>current = NIVEL_1]
    P1 --> A1[N1 or N2 approver<br/>same cost center approves]
    A1 --> P2[PENDING_APPROVAL<br/>current = NIVEL_2]
    P2 --> A2[N2 approver approves]
    A2 --> P3[PENDING_APPROVAL<br/>current = ADMIN]
    P3 --> A3[ADMIN approves<br/>final step]
    A3 --> TX{atomic budget UPDATE<br/>fits in competence month?}
    TX -->|yes| APP[APPROVED<br/>budget consumed_cents += total<br/>audit APPROVED]
    TX -->|no 422 BUDGET_EXCEEDED| P3b[PENDING_APPROVAL<br/>stays pending, audit failure]
    APP --> END([terminal])

    classDef st fill:#e8eaf6,stroke:#3f51b5;
    class DRAFT,P1,P2,P3,P3b st
    classDef fin fill:#c8e6c9,stroke:#43a047;
    class APP fin
```

Variant paths (documented in the state machine and sequence diagrams):
- **SOFTWARE** category → `ADMIN` appended as final step even below R$10.000.
- **≤ R$1.000** → single `NIVEL_1` step; **R$1.000,01–10.000** → two steps.
- **reject** at any current step → `REJECTED` (comment mandatory).
- **request-changes** → `CHANGES_REQUESTED` → owner edits → resubmit freezes **v2** with recalculated chain.
- **cancel** from any non-final state → `CANCELLED`.
