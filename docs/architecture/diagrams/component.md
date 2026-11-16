# Diagram — Back-end Components (C4 Level 3)

```mermaid
flowchart TB
    subgraph Web["api / security"]
        RID[RequestIdFilter]
        SEC[SecurityFilterChain<br/>JWT · ProblemResponses]
        RC[RequestController<br/>/requests/**]
        WC[WorkflowController<br/>/approvals/inbox · /dashboard/summary]
        AC[AdminController<br/>/auth · /users · /cost-centers]
        GEH[GlobalExceptionHandler]
        CU[CurrentUser]
    end

    subgraph Services["application"]
        IDS[IdempotencyService]
        PRS[PurchaseRequestService]
        TF[TransitionFacade]
        TS[TransitionService]
        RQS[RequestQueryService]
        IBX[InboxService]
        DS[DashboardService]
        AUS[AuthService · UserAdminService<br/>CostCenterService]
        AUD[AuditService]
        LCK[RequestLock · RequestAccess]
        MAP[RequestMapper · RequestSpecifications]
        JOB[IdempotencyPurgeJob]
    end

    subgraph Domain["domain (plain Java)"]
        SM[RequestStateMachine]
        CB[ApprovalChainBuilder]
        AP[ApprovalPolicies]
        ACP[AccessPolicy]
        MO[Money · BusinessCalendar]
        DE[DomainException · ErrorCode]
    end

    subgraph Persistence["persistence"]
        REPO[Spring Data repositories<br/>claim · consume · decide · skipAfter]
    end

    DB[(PostgreSQL)]

    RID --> SEC --> RC & WC & AC
    RC --> IDS --> PRS
    RC --> PRS & TF & RQS
    TF --> TS
    TF -->|budget failure| AUD
    WC --> IBX & DS
    AC --> AUS
    RC & WC & AC --> CU
    PRS & TS --> LCK & AUD & MAP
    TS --> SM & CB & AP
    RQS & IBX --> MAP
    MAP --> ACP
    IBX --> AP
    Services --> REPO --> DB
    JOB --> IDS
    Domain --> DE

    classDef dom fill:#e8f5e9,stroke:#43a047;
    class SM,CB,AP,ACP,MO,DE dom
```

Reading guide: arrows are allowed calls. Domain classes never import Spring/JPA. Controllers never call
repositories. `GlobalExceptionHandler` turns every exception leaving a controller into `problem+json`.
