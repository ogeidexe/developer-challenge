# Diagram — Containers (C4 Level 2)

Current state: the back end has a `Dockerfile`; the front end runs with Vite; **there is no
`docker-compose.yml` yet** (README §5.3 requires one). The dashed parts are the planned compose layout.

```mermaid
flowchart TB
    U[Browser]

    subgraph fe["frontend/ — React SPA"]
        VITE["Vite dev server :5173<br/>/api proxy → :3000"]
        MOCK[("fake backend in the browser<br/>(default, localStorage)")]
    end

    subgraph be["backend/ — Spring Boot (Dockerfile: Temurin 25)"]
        APP["app.jar :3000<br/>REST API · /health · /docs"]
        MIG["on start-up: Flyway V1–V6<br/>+ DemoSeed (once)"]
    end

    subgraph db["PostgreSQL 16"]
        PG[("10 tables<br/>CHECKs · triggers · indexes")]
    end

    U --> VITE
    VITE -.VITE_MOCK_BACKEND=true.-> MOCK
    VITE -->|VITE_MOCK_BACKEND=false| APP
    APP -->|JDBC 5432| PG
    MIG --> PG

    NG["planned: nginx container serving the build<br/>+ /api proxy"]:::planned
    U -.-> NG -.-> APP

    classDef planned stroke-dasharray: 5 5,fill:#fafafa,stroke:#999;
```

Container responsibilities:
- **frontend**: SPA; in development the Vite proxy forwards `/api/*` to the back end (prefix stripped).
- **backend**: stateless API; applies pending migrations and the one-time seed before serving.
- **db**: the only persistent store.
