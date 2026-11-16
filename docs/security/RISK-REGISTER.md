# Risk Register

Likelihood (L) and impact (I) are rated 1–3. The register lists residual risk after the fixes of 2026-11-15. Review it every quarter, or when an expiry date passes.

| ID | Risk | Findings | L | I | Residual | Treatment | Owner | Review / expiry |
|---|---|---|---|---|---|---|---|---|
| R-01 | Back-end security fixes do not compile or behave differently than intended (never executed) | F01, F03, F05–F13 | 2 | 3 | **High until verified** | Run `./mvnw verify` (locally or CI); fix forward without weakening tests | Developer | Before the first deploy |
| R-02 | Back-end dependency with a known critical CVE | F20 | 2 | 3 | Medium | CI Dependency-Check (CVSS ≥ 9 blocks) + dependency review; keep the Boot 4.1.x patch line current | Developer | First CI run |
| R-03 | Demo accounts with a public password enabled in a real environment | F11, F04 | 2 | 3 | Medium | **Accepted for the challenge** (README §5.3/§5.4 require a zero-step seeded start). Production must set `SEED_ENABLED=false` or rotate the passwords; the production SPA no longer advertises them | Operator | Before any non-demo deploy |
| R-04 | Signing secret weak or leaked | F13 | 1 | 3 | Low | Empty example, placeholder refusal, ≥ 32 bytes; keep it in a secret store; rotate by redeploying (tokens live ≤ 15 min) | Operator | Ongoing |
| R-05 | Cross-center budget read | F14 | 3 | 1 | Low | Accepted (README contract). Revisit if the contract may change: allow ADMIN or members of that center only | Product | 2027-02-15 |
| R-06 | Account enumeration and mass sign-up | F15 | 2 | 1 | Low | Accepted; add per-address throttling to `/auth/register` (reuse `LoginAttemptLimiter`) | Developer | 2027-02-15 |
| R-07 | Targeted lockout: attacker fails 5 logins for a known e-mail | F01 | 2 | 1 | Low | Accepted trade-off (15-min window, configurable); alternative: progressive delays or CAPTCHA | Developer | 2027-02-15 |
| R-08 | Token theft through a future XSS; no CSP | F16 | 1 | 2 | Low | No sink today; add CSP and headers on the SPA host; consider an httpOnly cookie with CSRF protection | Developer | When SPA hosting is added |
| R-09 | Developer workstation attacked through dev-server and tooling advisories | F18 | 2 | 2 | Medium | **Accepted until 2027-02-15**: dev server on localhost only, don't browse untrusted sites while it runs; upgrade Vite ≥ 6.4.x/7 and Cypress ≥ 15 in a dedicated change | Developer | **2027-02-15** |
| R-10 | React Router 6 advisories | F19 | 1 | 2 | Low | Mitigated by SEC-F02; upgrade to ≥ 7.18 | Developer | 2027-02-15 |
| R-11 | Runtime DB role can alter schema and disable triggers | F17 | 1 | 3 | Medium | Separate migration and app roles; V5 already revokes from `purchase_app` | Developer / DBA | Before production |
| R-12 | Throttling ineffective with several instances or behind a proxy | F21 | 2 | 2 | Low | Shared store if scaled out; `server.forward-headers-strategy` only for a trusted proxy | Developer | When scaling |
| R-13 | Missing TLS / unpinned images / no compose hardening | F22 | 2 | 2 | Medium | TLS at ingress, image digests, image scan in CI, compose without published DB port | Developer | With `docker-compose.yml` |
| R-14 | CI security checks not active | F26 | 2 | 2 | Medium | Push the workflow; add `NVD_API_KEY`; require the checks in branch protection | Repo owner | First push |
