# Diagram — Deployment Architecture (planned; not implemented yet)

> **Status:** neither the root `docker-compose.yml` nor the CI workflow exists yet. This is the target
> shape for README §5.3; what exists today is `backend/Dockerfile` and the front end's Vite setup.

```mermaid
flowchart LR
    subgraph CI["GitHub Actions (to be written)"]
        J1[job backend — ./mvnw verify<br/>unit + Testcontainers integration/concurrency]
        J2[job frontend — npm ci · build · npm run test:e2e]
    end

    subgraph Host["docker compose up --build (to be written)"]
        subgraph FEC["frontend container"]
            FE1[nginx :80<br/>static build<br/>/api → backend:3000]
        end
        subgraph BEC["backend container — exists: backend/Dockerfile"]
            BE1[eclipse-temurin:25-jre :3000<br/>Flyway + seed on start → API]
        end
        subgraph DBC["db container"]
            DB1[postgres:16<br/>volume · healthcheck pg_isready]
        end
    end

    DEV[Evaluator browser] -->|http://localhost| FE1
    FE1 -->|/api proxy| BE1
    BE1 -->|JDBC| DB1
    J1 -.checks.-> BEC
    J2 -.checks.-> FEC

    classDef ci fill:#f3e5f5,stroke:#8e24aa;
    class J1,J2 ci
```

Facts that already hold:
- The back end needs no manual step: Flyway migrates and `DemoSeed` seeds on start-up (README §5.3).
- Environment variables are listed in the root `.env.example` (`DB_*`, `JWT_*`, `PORT`, `SEED_ENABLED`, `VITE_MOCK_BACKEND`).
- For compose, the front end must be built with `VITE_MOCK_BACKEND=false`, otherwise it keeps using the in-browser fake backend.
