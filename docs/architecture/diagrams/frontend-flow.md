# Diagram — Front-end Request Flow

```mermaid
flowchart LR
    subgraph Screens["features/ (Ant Design)"]
        LOGIN[LoginPage]
        DASH[DashboardPage]
        LIST[RequestListPage]
        FORM[RequestFormPage]
        DETAIL[RequestDetailPage]
        INBOX[InboxPage]
        ADMIN[AdminPage]
    end
    subgraph Infra["shared/"]
        RT[App.tsx router<br/>RequireAuth · RequireRole]
        Q[TanStack Query<br/>no retry on 4xx]
        API[api/client.ts<br/>Bearer + X-Request-Id<br/>problem+json → ApiError]
        AUTH[auth/AuthContext<br/>sessionStorage · 401 → login]
        UI[ui.tsx<br/>tags · money · PageHeader · field errors]
    end
    subgraph Backends["backend selected by VITE_MOCK_BACKEND"]
        MOCK[api/mock/backend.ts<br/>in-browser, localStorage]
        REAL[Spring Boot API<br/>via /api proxy]
    end

    LOGIN --> AUTH --> RT
    RT --> DASH & LIST & FORM & DETAIL & INBOX & ADMIN
    DASH & LIST & FORM & DETAIL & INBOX & ADMIN --> Q --> API
    API -->|true, default| MOCK
    API -->|false| REAL

    classDef s fill:#e0f7fa,stroke:#00838f;
    class Screens s
```

Rules the front end obeys (README §2.7), each covered by a Cypress spec:
1. List state (filters, sort, page) lives in the URL — links are shareable (`03-request-list`).
2. Action buttons come only from `allowedActions` (`05-request-detail`).
3. The form total is display only; the server recalculates (`04-request-form`).
4. `401` anywhere → login → back to the original route (`01-login`).
5. `409` → "Alguém agiu antes de você" banner + refetch; `422` → the server's `detail` (`05-request-detail`).
