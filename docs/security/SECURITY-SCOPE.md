# Security Assessment Scope

| Item | Value |
|---|---|
| Type | Authorized defensive assessment and remediation of this repository (white box) |
| Date | 2026-11-15 |
| Target | Local working tree of branch `teste-pleno`, including uncommitted `backend/`, `frontend/`, `docs/`, `.env.example` |
| Standards | OWASP ASVS 4.0.3 (L2, selected chapters), OWASP Top 10 2021, OWASP API Security Top 10 2023, CWE |
| Environment | Windows 11 workstation, Node 26, Cypress 13 (Electron 118); **no JDK, no Docker** |

## In scope

| Area | Items |
|---|---|
| Back end | `backend/src/main/**` (Spring Boot 4.1, Spring Security 7, JPA/Hibernate 7, Flyway V1–V7), `application.yml`, `Dockerfile`, `pom.xml` |
| Front end | `frontend/src/**`, `vite.config.ts`, `package.json` and `package-lock.json`, Cypress config |
| Data | Flyway migrations, constraints, triggers, transaction and concurrency design |
| Config / secrets | `.env.example`, `application.yml`, source code, git history (11 commits) |
| CI/CD | `.github/workflows/` (none existed; `security.yml` added) |
| Business logic | README §2–§4 rules: chain, segregation, budget, versions, idempotency, visibility |

## Out of scope / not possible

| Item | Reason |
|---|---|
| Running the back end, its tests, DAST (OWASP ZAP) | No JDK or Docker in the audit environment; installing a JDK was not permitted. Back-end fixes are **unverified** |
| Back-end SCA (OWASP Dependency-Check, OSV) | Needs Maven to resolve the tree; delegated to CI (SEC-F20) |
| Semgrep / CodeQL / Trivy locally | Not installed; CodeQL runs in CI. Trivy was deliberately not used (its GitHub Action had a tag-hijack compromise in March 2026) |
| `docker-compose.yml`, production hosting, TLS | Do not exist yet |
| Third-party systems and infrastructure | Never contacted; the only network calls were `npm audit` (npm registry) and the existing local dev server |
| Protected repository files (`README.md`, `AGENTS.md`, `.agents/`, `.githooks/`, …) | Read-only by the repository rules |

## Method

1. Discovery: every back-end class, migration, configuration file and front-end security-relevant module was read.
2. Architecture and business rules from the README and `docs/` were mapped to code.
3. Threat model (STRIDE per boundary and workflow): [THREAT-MODEL.md](THREAT-MODEL.md).
4. Static review: manual review, plus `grep`-based checks for SQL concatenation, unsafe HTML, storage, redirects and secrets.
5. SCA: `npm audit` for the front end.
6. Secrets: pattern scan of the working tree and the full git history.
7. Classification: [FINDINGS.md](FINDINGS.md).
8. Remediation with regression tests: [REMEDIATION-LOG.md](REMEDIATION-LOG.md).
9. Verification: front-end typecheck, production build inspection, Cypress (54/54). Back end: written but not executed.
