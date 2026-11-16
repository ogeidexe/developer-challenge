# Asset Inventory

| ID | Asset | Location | C / I / A | Owner of protection | Notes |
|---|---|---|---|---|---|
| AS-01 | User credentials (password hashes) | `users.password_hash` | **H** / H / M | bcrypt, `UserMapping` (never serialized) | Demo users share one public password (SEC-F11) |
| AS-02 | JWT signing key | env `JWT_SECRET` | **H** / **H** / H | `SecurityConfig.jwtSigningKey` | Compromise means anyone can mint ADMIN tokens |
| AS-03 | Access tokens | client `sessionStorage` (`kp_auth`), `Authorization` header | H / H / L | 15-min TTL, `aud`/`iss`/`exp` | SEC-F16 |
| AS-04 | Roles, levels, cost-center binding | `users.role/approver_level/cost_center_id` | M / **H** / M | ADMIN-only writes, re-loaded per request | Basis of every authorization decision |
| AS-05 | Purchase requests (working copy) | `purchase_requests`, `request_items` | M / H / M | Visibility, owner, state, `lock_version` | |
| AS-06 | Frozen versions | `request_versions`, `version_items` | M / **H** / M | V5 triggers | Evidence of what was approved |
| AS-07 | Approval decisions | `approval_steps` | M / **H** / M | Policies + V7 trigger | Who, when, outcome, comment |
| AS-08 | Budgets (amount, consumed) | `budgets` | M / **H** / H | ADMIN-only PUT + pessimistic lock; conditional consume + CHECK | Financial integrity |
| AS-09 | Audit history | `request_events` | M / **H** / M | Append-only trigger, `X-Request-Id` | Non-repudiation |
| AS-10 | Idempotency records | `idempotency_keys` (stored response bodies) | M / M / L | Per-user key, 24 h TTL, hourly purge | Contains a copy of request details |
| AS-11 | Personal data | `users.email`, `users.name`; names in responses | M / M / L | Visible only through scoped endpoints; admins list users | No CPF, address or payment data |
| AS-12 | Database credentials | env `DB_URL/DB_USER/DB_PASSWORD` | H / H / H | env only | Default fallback (SEC-F23); owner role (SEC-F17) |
| AS-13 | Application logs | stdout (ECS JSON) | M / M / L | No credentials; request ids | Constraint messages may contain an e-mail (warn level) |
| AS-14 | Source and CI | git, `.github/workflows` | L / H / M | gitleaks, CodeQL, dependency review | Supply chain |
| AS-15 | Front-end bundle | `frontend/dist` (build output) | L / M / M | Compile-time flags | Must not contain demo credentials (SEC-F04) |

**Privileged operations:**
- `POST/PATCH /users` (create or promote any role);
- `PUT /cost-centers/{id}/budgets/{month}`;
- `POST /cost-centers`;
- final approval (consumes budget);
- ADMIN-level approval step;
- cancel by ADMIN.

**Sensitive data flows:**
1. Credentials: browser → `/auth/login` → bcrypt compare → JWT.
2. JWT: browser storage → `Authorization` header → decoder.
3. Approval decision → step update + budget consume + event (one transaction).
4. Secrets: env → JVM. They are never written to the database, logs or responses.
