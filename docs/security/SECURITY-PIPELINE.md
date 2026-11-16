# Security Pipeline (`.github/workflows/security.yml`)

**Triggers:** every pull request; pushes to `main` and `teste-pleno`; weekly (Monday 06:17 UTC, because new CVEs appear without code changes); manual runs.

**Defaults:**
- `permissions: contents: read` (CodeQL alone adds `security-events: write`);
- `concurrency` cancels superseded runs of the same ref.

| Job | Tool | Blocks the build when | Notes |
|---|---|---|---|
| `frontend-dependencies` | `npm audit` | **high/critical** in runtime dependencies (`--omit=dev`); **critical** in any dependency | `npm ci --ignore-scripts`: no package install script runs in CI |
| `dependency-review` (PRs) | `actions/dependency-review-action@v4` | the PR **adds** a dependency with a **high/critical** advisory (npm and Maven) | Needs the dependency graph (on by default for public repos) |
| `secrets` | gitleaks `v8.18.4` (container) | any finding, full history | `--redact`: values never appear in the log |
| `codeql` | `github/codeql-action@v4`, `security-extended`, Java/Kotlin and JS/TS, `build-mode: none` | results go to the Security tab; becomes blocking with a branch-protection rule on code-scanning alerts (high+) | No JDK build needed for extraction |
| `backend` | `./mvnw verify` (all tests, including the security regression tests) + OWASP Dependency-Check `12.1.0` | any test fails; a dependency has **CVSS ≥ 9** | Dependency-Check runs only if the secret `NVD_API_KEY` exists. CI uses a throw-away `JWT_SECRET` |
| `dockerfile` | hadolint `v2.12.0` (container) | Dockerfile **errors** (warnings reported only) | |

## Blocking policy

- **Must block:**
  - known critical vulnerabilities (any dependency);
  - high vulnerabilities in runtime dependencies;
  - newly added high/critical dependencies;
  - leaked secrets;
  - failing security regression tests.
- **Reported, not blocking:** moderate/low advisories, dev-only highs (see exceptions), hadolint warnings, CodeQL findings until branch protection is configured.

## Exceptions (with expiry)

| Exception | Why | Expires |
|---|---|---|
| Dev-only highs in `vite`, `cypress` → `extract-zip` (SEC-F18) | They need major upgrades; dev tooling only; `npm audit --omit=dev` excludes them and the "critical anywhere" gate still applies | **2027-02-15**, then upgrade or renew with a justification |
| Dependency-Check skipped without `NVD_API_KEY` | An anonymous NVD sync is too slow for CI | Until the secret is added (R-14) |

## Hardening of the pipeline itself

- Only first-party GitHub actions are used (`actions/*`, `github/codeql-action`). The other tools run as version-pinned containers.
- Trivy is deliberately absent: `aquasecurity/trivy-action` tags were hijacked in March 2026. If it is added, pin it **by commit SHA**.
- Recommended next step: pin every action by commit SHA and let Dependabot propose updates. `.github/dependabot.yml` lies outside this repository's allowed paths for agents; add it manually.
- No secret is printed. Tests receive only a CI-scoped dummy `JWT_SECRET`.
- The pipeline does not change git hooks or `core.hooksPath` (repository rule).
