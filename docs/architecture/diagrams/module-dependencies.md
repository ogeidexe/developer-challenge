# Diagram — Back-end Package Dependencies

```mermaid
flowchart TD
    API["api<br/>controllers · DTO records · exception handler · request-id filter"]
    SEC["security<br/>JWT · filter chain · CurrentUser"]
    APP["application<br/>services · queries · idempotency · audit · mapping"]
    PER["persistence<br/>entities · repositories"]
    CFG["config<br/>properties · clock/calendar · DemoSeed"]
    DOM["domain<br/>plain Java — imports nothing"]

    API --> APP
    API --> SEC
    SEC --> PER
    APP --> PER
    APP --> DOM
    PER --> DOM
    APP -.uses DTO records.-> API
    CFG --> APP
    CFG --> DOM
    SEC --> CFG

    classDef leaf fill:#fff3e0,stroke:#fb8c00;
    class DOM leaf
```

Notes:
- `domain` is the only package with no outgoing dependency — the requirement of README §5.1.
- `application` reuses the DTO records of `api.dto` as its output types (a pragmatic shortcut: no
  separate application-level result types). It does not depend on controllers.
- `config.DemoSeed` drives the real services, so the seed exercises the same rules as the API.
