# Security Audit Progress

Checkpoint log, so a later session can resume from the last validated stage.

| Stage | Status | Output / evidence | Date |
|---|---|---|---|
| 1. Repository discovery | ✔ | All back-end classes, migrations V1–V6, config, Dockerfile, POM; front-end auth, API client, routing, storage; git history (11 commits) | 2026-11-15 |
| 2. Architecture understanding | ✔ | [SECURITY-ARCHITECTURE.md](SECURITY-ARCHITECTURE.md), [ASSET-INVENTORY.md](ASSET-INVENTORY.md) | 2026-11-15 |
| 3. Threat modeling | ✔ | [THREAT-MODEL.md](THREAT-MODEL.md) (STRIDE, 5 workflows, Mermaid trust boundaries) | 2026-11-15 |
| 4. Static and dependency analysis | ◐ | `npm audit` done; back-end SCA not possible (no Maven) → CI | 2026-11-15 |
| 5. Manual security review | ✔ | 27 findings + false-positive table in [FINDINGS.md](FINDINGS.md) | 2026-11-15 |
| 6. Controlled security tests | ◐ | Front end executed (Cypress 54/54, bundle inspection); back end written, not executed | 2026-11-15 |
| 7. Findings classification | ✔ | Severity, CWE, OWASP, CVSS 4.0 vectors, C1/C2/C3/FP | 2026-11-15 |
| 8. Remediation | ✔ | 12 fixed, 1 partly, 1 toggle, CI pipeline — [REMEDIATION-LOG.md](REMEDIATION-LOG.md) | 2026-11-15 |
| 9. Regression testing | ◐ | Front end ✔; **back end pending first `./mvnw verify`** | 2026-11-15 |
| 10. Final audit and documentation | ✔ | [FINAL-SECURITY-REPORT.md](FINAL-SECURITY-REPORT.md) | 2026-11-15 |

## Resume here

1. In `backend/`: `./mvnw verify` with Docker running. Record the results in SECURITY-TEST-RESULTS and switch the ◐ findings to ✔ (or reopen them).
2. Record the first CI Dependency-Check result in DEPENDENCY-AUDIT (SEC-F20).
3. Work the open items in RISK-REGISTER, by expiry date.
