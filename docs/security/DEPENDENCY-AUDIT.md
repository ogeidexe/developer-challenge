# Dependency Audit — 2026-11-15

## Front end (`frontend/package-lock.json`, `npm audit`)

Installed versions: `react 18.3`, `react-dom 18.3`, `react-router-dom 6.30.6`, `antd 5.29.3`, `@tanstack/react-query 5`, `dayjs 1.11`. Dev: `vite 5.4.21`, `@vitejs/plugin-react 4`, `typescript 5.6`, `cypress 13.17.0`.

| Package | Severity | Advisory | Runtime? | Exposure | Fix | Decision |
|---|---|---|---|---|---|---|
| `react-router` / `react-router-dom` 6.30.6 | moderate | GHSA-wrjc-x8rr-h8h6: open redirect via backslash in `<Link>`/`useNavigate` | **yes** | Only `returnUrl` takes external input; sanitized (SEC-F02) | 7.18+ (major) | Mitigated; upgrade planned (R-10) |
| same | moderate | GHSA-337j-9hxr-rhxg: constructor injection in SSR `deserializeErrors` | yes | **Not applicable**: no SSR / data router hydration | 7.18+ | Not applicable |
| `vite` 5.4.21 | high | GHSA-4w7w-66w2-5vf9: path traversal in optimized deps `.map` handling (dev server) | no | Dev server on `localhost` only | ≥ 6.4.x / 7 (major) | Accepted until 2027-02-15 (R-09) |
| `vite` (via `launch-editor`) | high | GHSA-v6wh-96g9-6wx3 (NTLMv2 hash disclosure via UNC paths, Windows), GHSA-698v-4r3x-3vcv (`%` escaping, Windows) | no | Dev machines on **Windows** (this one is) | same | Accepted until 2027-02-15; don't open untrusted links while `npm run dev` runs |
| `esbuild` ≤ 0.24.2 | moderate | GHSA-67mh-4wv8-2f99: any website can send requests to the dev server and read the response | no | Dev server | via Vite upgrade | Accepted (R-09) |
| `cypress` 13.17 → `extract-zip` ≤ 2.0.1 | high | GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3: symlink path traversal on unzip | no | Only when Cypress unpacks its own binary from the official CDN | Cypress major upgrade | Accepted (R-09) |
| `@cypress/request` → `qs` 6.14.3 | moderate | GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g (DoS) | no | Test runner HTTP client | `qs` ≥ 6.16, blocked by `@cypress/request`'s `~6.14` range | Accepted |
| `@cypress/request` → `uuid` | moderate | GHSA-w5hq-g745-h8pq: buffer bounds in v3/v5/v6 with `buf` | no | Not reachable in our use | Cypress upgrade | Accepted |

**Other checks:**
- **Pinning:** `package-lock.json` is committed. CI uses `npm ci --ignore-scripts`, so the exact tree is installed and no install script runs.
- **Sources:** only the public npm registry (no `.npmrc` overrides), no git or URL dependencies.
- **Dependency confusion:** the package is `private: true`, and there are no internal or scoped private packages.
- **Abandoned or suspicious packages:** none among direct dependencies; all are mainstream, actively maintained projects.
- **Why not `npm audit fix --force`:** it would move Vite to 8.x, React Router to 7.x and Cypress to 16.x in one step. That changes the dev server API used by `cypress/e2e-runner.mjs`, the router API used by every page, and the Electron version of the E2E runner. Do it as a separate, tested change.

## Back end (`backend/pom.xml`)

| Item | Value |
|---|---|
| Parent / BOM | `spring-boot-starter-parent 4.1.2` (manages Spring Framework 7, Spring Security 7, Hibernate 7, Jackson 3, Tomcat, Flyway, PostgreSQL JDBC, Nimbus JOSE) |
| Direct, non-BOM | `springdoc-openapi-starter-webmvc-ui 3.2.0` |
| Test | Testcontainers (BOM-managed), JUnit 5, AssertJ |
| Scan status | **Not scanned** (SEC-F20): no JDK or Maven available to resolve the tree |
| CI coverage | `backend` job: OWASP Dependency-Check `12.1.0`, fails on CVSS ≥ 9 (needs secret `NVD_API_KEY`); `dependency-review` job blocks PRs adding high/critical advisories |
| Pinning | Exact versions via the Boot BOM; Maven Wrapper pins Maven 3.10.0 |

**Recommendation:** after the first CI run, record the Dependency-Check result here. Keep Boot on the latest 4.1.x patch line; Boot patch releases carry the managed CVE fixes.

## Container base images

- `eclipse-temurin:25-jdk` (build) and `eclipse-temurin:25-jre` (runtime) are pinned by tag (SEC-F22).
- Recommendation: pin by digest and let Dependabot or Renovate bump it, and scan the built image in CI. Trivy is the usual choice, but pin its action by commit SHA because of the March 2026 tag compromise.
