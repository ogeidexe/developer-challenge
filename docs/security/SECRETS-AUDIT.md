# Secrets Audit — 2026-11-15

**Method:** a regex scan of the working tree (excluding `node_modules`, `.git`, `target`, `dist`, `cypress` artifacts) and of the full git history (`git log --all -p`, 11 commits).

**Patterns:**
- private-key headers;
- AWS access keys;
- GitHub, Slack and `sk-` style tokens;
- three-part JWTs;
- generic `password|secret|token|api_key = …` assignments.

Only file locations were recorded. **No value is reproduced in this report.**

## Results

| Scope | High-confidence formats (keys, tokens, JWTs) | Generic assignments |
|---|---|---|
| Git history | **0** | not triaged (history contains only docs and hooks) |
| Working tree | **0** | 15 files, all triaged below |

| Location | What it is | Verdict |
|---|---|---|
| `.env.example` | `DB_PASSWORD=change-me` placeholder; `JWT_SECRET` **now empty** | Example only. The former JWT placeholder was usable as a real key (SEC-F13), now fixed |
| `backend/src/main/resources/application.yml:8` | `DB_PASSWORD` fallback `purchase` | Local-dev default (SEC-F23); must be set in production |
| `backend/.../config/DemoSeed.java` | Demo password constant | Fictional, public by design (README §5.4); no longer logged (SEC-F11) |
| `frontend/src/features/auth/LoginPage.tsx` | Same demo password for the picker | Excluded from production builds (SEC-F04) |
| `frontend/src/shared/api/mock/backend.ts` | Fake token generation and seed passwords of the in-browser mock | Dev/mock only; excluded from production builds (SEC-F04) |
| `backend/src/test/**` (`IntegrationTest`, `SecurityIntegrationTest`, `SecurityTestSupport`) | Test-only JWT secrets and passwords | Test fixtures; never used outside tests |
| `.github/workflows/security.yml` | CI-only JWT secret built from the run id | Not a credential for any environment |
| `backend/README.md` | `export JWT_SECRET=$(openssl rand -base64 48)` | Instruction, not a value |
| `backend/mvnw` | Wrapper variable names (`MVNW_PASSWORD`) | Code |
| `AuthService.java`, `JwtService.java`, `SecurityConfig.java`, `AuthContext.tsx` | Variable names (`token`) or the placeholder deny-list | Code |

## Exposure and rotation

- **No real secret was found**, in the tree or in history, so nothing needs rotation.
- `.env` is excluded by `backend/.dockerignore` and must remain git-ignored. The root `.gitignore` is a protected file; it was not changed.
- **Control going forward:** gitleaks in CI (`security.yml` → `secrets`, full history, `--redact`).
- The repository's AI-usage log (`.agents/changelog/diff.md`) is append-only and masks common key patterns. The README asks contributors not to paste secrets into prompts.
