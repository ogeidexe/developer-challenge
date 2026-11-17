# RNF-07 — Execução e CI

| Origem | IDs relacionados | Status |
|---|---|---|
| README §5.3, §7.1 | NFR-009…NFR-012, INF-001, INF-002, QA-007 | ✅ atendido |

## Requisito

`docker compose up --build` na raiz sobe banco, back-end e front-end, roda migrations e seed **sem passo
manual**. Pipeline de CI com build, lint e testes dos dois lados, **verde no commit final**. Nenhuma ferramenta
que altere os hooks do Git.

## Regras verificáveis

- **RN-R07.1** `docker compose up --build` num clone limpo, sem `.env`, deixa a stack pronta:
  tudo atrás do gateway Nginx em `:8080`: SPA em `/`, API em `/api`, `/health` e `/docs` (ADR-016). Back-end,
  front-end e Redis não são publicados no host.
- **RN-R07.2** O back-end só sobe depois do banco e do Redis saudáveis; o gateway só sobe depois do front e do
  back-end saudáveis. O back-end é saudável quando `/health` responde HTTP `200` (status geral `UP` e aplicação
  pronta, isto é, depois do seed).
- **RN-R07.3** Flyway aplica as migrations e o seed roda na primeira subida, sem comando manual.
- **RN-R07.4** CI (`.github/workflows/ci.yml`) em todo push e PR:
  - back-end: Checkstyle + todos os testes (`./mvnw verify`);
  - front-end: ESLint, Prettier, typecheck, build de produção e E2E Cypress;
  - o contêiner do front-end sobe **sozinho**, sem o back-end (`--no-deps frontend`), e fica saudável;
  - `docker compose up --build --wait` + smoke test só pelo gateway (health com banco e Redis `UP`, cabeçalhos de
    segurança, Swagger, login, logout encerrando a sessão, back-end fora do host) e a suíte Cypress contra a API real.
  - `pages-check`: os badges só são publicados se o GitHub Pages estiver habilitado (senão o job é pulado).
- **RN-R07.5** Segurança (`.github/workflows/security.yml`): npm audit, dependency review, gitleaks, CodeQL,
  OWASP Dependency-Check (com chave NVD) e hadolint.
- **RN-R07.6** Lint e formatação também rodam localmente: `./mvnw checkstyle:check`, `npm run lint`, `npm run format:check`.
- **RN-R07.7** Proibido husky, lefthook, pre-commit ou qualquer coisa que mude `core.hooksPath` (regra eliminatória).
- **RN-R07.8** Release (`.github/workflows/release.yml`): tag `vX.Y.Z` → testes, imagens no GHCR e GitHub Release
  com o jar, o bundle do front e checksums.
- **RN-R07.9** A imagem do front-end não depende do back-end para subir: o Nginx dela resolve o `BACKEND_URL` a
  cada requisição (`resolver` + `proxy_pass` com variável, `NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1`), em vez de na
  inicialização. Sem o back-end, `/api` responde `502`, mas a SPA é servida. Isso corrigiu o erro
  `host not found in upstream "backend"` que derrubava o contêiner.

## Critérios de aceite

| # | Verificação | Resultado esperado |
|---|---|---|
| CA-R07.1 | `docker compose up --build` num clone limpo | as 3 aplicações ficam saudáveis sem passo manual |
| CA-R07.2 | `curl localhost:8080/health` | `{"status":"UP",…}` com `db` e `redis` `UP` |
| CA-R07.3 | último commit da `teste-pleno` | workflows `ci` e `security` verdes |
| CA-R07.4 | `git config core.hooksPath` após `./setup.sh` | aponta para os hooks do desafio; nenhuma ferramenta o altera |
| CA-R07.5 | `docker compose up --build --wait --no-deps frontend` | o front-end fica saudável sem o back-end (passo "frontend starts alone" do CI) |

## Implementação

- `docker-compose.yml` (inclui a config do gateway Nginx em `configs`), `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx/default.conf.template`
- `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/workflows/release.yml`
- `backend/config/checkstyle.xml`, `frontend/eslint.config.js`, `frontend/.prettierrc.json`

## Testes

- CA-R07.1, CA-R07.2: job `compose` do `ci.yml`
- CA-R07.5: job `compose` do `ci.yml`, passo "frontend starts alone (no backend)"
- CA-R07.3: badges no topo do [`SOLUTION.md`](../../SOLUTION.md)
- CA-R07.4: verificado por inspeção (nenhuma dependência como husky/lefthook no `package.json`) e pela auditoria dos avaliadores
