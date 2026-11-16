# Diagram — Back-end Packages and Dependency Direction

```mermaid
flowchart TB
    subgraph API["api + security (web adapters)"]
        direction LR
        CT[Controllers]
        FL[RequestIdFilter · SecurityFilterChain]
        EH[GlobalExceptionHandler]
        DTO[DTO records — api.dto]
    end
    subgraph APP["application"]
        direction LR
        SVC["@Transactional use-case services"]
        Q[Queries · Specifications]
        MAP[RequestMapper · UserMapping]
    end
    subgraph DOM["domain — plain Java"]
        direction LR
        POL[RequestStateMachine · ApprovalChainBuilder<br/>ApprovalPolicies · AccessPolicy]
        VAL[Money · BusinessCalendar · Actor · StepState · enums]
        ERR[sealed DomainException · ErrorCode]
    end
    subgraph PER["persistence"]
        direction LR
        ENT[JPA entities]
        REPO[Spring Data repositories<br/>+ concurrency SQL]
    end

    API --> APP
    APP --> DOM
    APP --> PER
    PER --> DOM

    classDef core fill:#e3f2fd,stroke:#1e88e5;
    class DOM core
```

Rules (by package convention and review; an ArchUnit test would make them executable):

1. `domain` imports nothing from the other packages and no Spring, JPA or servlet types (README §5.1).
2. The domain receives plain values (`Actor`, `StepState`, `AccessPolicy.RequestView`), never entities.
3. `application` owns transactions; controllers never touch repositories.
4. Entities never reach HTTP: controllers return DTO records built by the mappers.
