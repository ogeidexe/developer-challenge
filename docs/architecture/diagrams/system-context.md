# Diagram — System Context (C4 Level 1)

```mermaid
flowchart LR
    subgraph People
        SOL[Solicitante<br/>creates / edits / submits<br/>own requests]
        APR[Aprovador N1 / N2<br/>approves steps of own<br/>cost center]
        ADM[Admin<br/>manages users, centers,<br/>budgets; approves ADMIN step]
    end

    subgraph System["Purchase Request System (this solution)"]
        SPA[React SPA]
        API[Spring Boot REST API]
        DB[(PostgreSQL)]
    end

    SOL --> SPA
    APR --> SPA
    ADM --> SPA
    SPA -->|HTTPS + JWT| API
    API --> DB

    classDef ext fill:#f5f5f5,stroke:#999;
    class SOL,APR,ADM ext
```

Notes:
- Actors map to README §1.1 (`SOLICITANTE`, `APROVADOR` with `approverLevel`, `ADMIN`).
- The SPA talks **only** to the REST API; business rules exist solely server-side (README §1, §2.7).
- No external systems are required by the challenge; SMTP/metrics are optional differentiators (§6).
