# Diagram — Authentication and Authorization Flow

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant F as React SPA
    participant SEC as SecurityFilterChain<br/>(JWT resource server)
    participant A as AdminController → AuthService
    participant S as Service (business rules)
    participant DB as PostgreSQL

    U->>F: credentials
    F->>A: POST /auth/login {email, password} (public route)
    A->>DB: find user by e-mail
    A->>A: BCrypt match (dummy hash when the e-mail is unknown)
    alt invalid or inactive
        A-->>F: 401 problem+json UNAUTHENTICATED (same message for every failure)
    else valid
        A->>A: JwtService: HS256, exp = iat + 15 min<br/>claims sub, role, costCenterId, approverLevel, name
        A-->>F: { token, tokenType, expiresIn, user }
        F->>F: store token (sessionStorage)
    end

    U->>F: protected action
    F->>SEC: Authorization: Bearer …
    SEC->>SEC: verify signature, exp/nbf, issuer
    alt missing / invalid / expired
        SEC-->>F: 401 problem+json
        F->>F: clear session → /login?returnUrl=…
    else valid
        SEC->>S: controller → CurrentUser re-loads the user from DB
        Note over S: in README §4.3 order:<br/>404 visibility → 403 role/owner →<br/>409 lockVersion → 422 rules
        S-->>F: 200 / problem+json
    end
```

Design points (ADR-006, ADR-007):
- The filter chain only authenticates. Role, ownership, eligibility and segregation run in the services
  with pure domain policies — a URL-level role rule would answer 403 before the 404 visibility check.
- Token claims are informational; the user is re-loaded per request, so role changes and deactivation
  apply immediately.
