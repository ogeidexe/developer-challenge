# Security

Security assessment and hardening of the purchase-request system, 2026-11-15.

**At a glance:**
- **Findings:** 27 (0 critical, 0 high, 6 medium, 14 low, 7 informational).
- **Fixed:** 12. Two are verified by executed tests (SEC-F02 open redirect, SEC-F04 insecure front-end build default). Ten back-end fixes are written with regression tests but **not yet executed** (no JDK or Docker in the audit environment).
- **New controls:**
  - login throttling (429);
  - request body cap (413);
  - JWT `aud`/`exp` enforcement and refusal of placeholder secrets;
  - bcrypt byte limit;
  - escaped search wildcards;
  - case-insensitive unique e-mail;
  - immutable decided approval steps (V7);
  - production builds without the fake backend or demo credentials;
  - a CI security workflow.

| Document | Purpose |
|---|---|
| [FINAL-SECURITY-REPORT.md](FINAL-SECURITY-REPORT.md) | Executive summary, posture, recommendations, residual risk |
| [FINDINGS.md](FINDINGS.md) | Every finding: CWE, OWASP, CVSS 4.0 vector, evidence, fix, tests; false positives |
| [RISK-REGISTER.md](RISK-REGISTER.md) | Residual risks, treatment, owners, expiry dates |
| [REMEDIATION-LOG.md](REMEDIATION-LOG.md) | Change-by-change record and compatibility notes |
| [THREAT-MODEL.md](THREAT-MODEL.md) | STRIDE, trust boundaries, attack surface, workflow abuse cases |
| [SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md) | Controls as implemented, mapped to ASVS |
| [ASSET-INVENTORY.md](ASSET-INVENTORY.md) | Assets, sensitivity, privileged operations, data flows |
| [SECURITY-SCOPE.md](SECURITY-SCOPE.md) | Scope, method, limitations |
| [SECURITY-TEST-PLAN.md](SECURITY-TEST-PLAN.md) | Test scenarios → test cases |
| [SECURITY-TEST-RESULTS.md](SECURITY-TEST-RESULTS.md) | What ran, what passed, what could not run |
| [DEPENDENCY-AUDIT.md](DEPENDENCY-AUDIT.md) | npm audit triage; back-end and image status |
| [SECRETS-AUDIT.md](SECRETS-AUDIT.md) | Secret scan of the tree and history (locations only) |
| [SECURITY-CHECKLIST.md](SECURITY-CHECKLIST.md) | ASVS-style checklist with status |
| [SECURITY-PIPELINE.md](SECURITY-PIPELINE.md) | `.github/workflows/security.yml`: jobs, blocking policy, exceptions |
| [SECURITY-AUDIT-PROGRESS.md](SECURITY-AUDIT-PROGRESS.md) | Stage checkpoints and where to resume |

**Production settings that matter:**
- `JWT_SECRET`: random, at least 32 bytes.
- `SEED_ENABLED=false`.
- `DB_PASSWORD`: set explicitly.
- `API_DOCS_ENABLED=false`, if the docs should not be public.
- Front-end builds: leave `VITE_MOCK_BACKEND` and `VITE_DEMO_LOGIN` unset. The compose stack is a demo and turns
  `VITE_DEMO_LOGIN` on by default (pre-filled seed admin); set `VITE_DEMO_LOGIN=false` for any non-demo deployment.
- Run as a single instance, or move login throttling to a shared store.
