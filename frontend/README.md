# Frontend — Solicitações de Compra (Kingspan challenge)

[![version](https://img.shields.io/github/v/release/ogeidexe/developer-challenge?include_prereleases&sort=semver&label=version)](https://github.com/ogeidexe/developer-challenge/releases) [![ci](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml/badge.svg?branch=teste-pleno)](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml?query=branch%3Ateste-pleno) [![security](https://github.com/ogeidexe/developer-challenge/actions/workflows/security.yml/badge.svg?branch=teste-pleno)](https://github.com/ogeidexe/developer-challenge/actions/workflows/security.yml?query=branch%3Ateste-pleno) [![e2e-tests](https://img.shields.io/endpoint?url=https://ogeidexe.github.io/developer-challenge/badges/e2e-tests.json)](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml?query=branch%3Ateste-pleno)

SPA React 18 + Vite + TypeScript + Ant Design 5, com **backend simulado em memória** que implementa o
contrato OpenAPI 3.1 (`docs/api/openapi.yaml`): máquina de estados, cadeia de aprovação (valor +
categoria `SOFTWARE`), segregação de funções, `lockVersion` (409), orçamento por competência
(`BUDGET_EXCEEDED`), versões imutáveis, histórico append-only, idempotência de criação, caixa de
aprovação e dashboard.

## Como rodar

```bash
npm install
npm run dev      # http://localhost:5173 — backend simulado em memória, não precisa de API
npm run dev:api  # http://localhost:5173 — API real (proxy /api → http://localhost:3000)
```

Com `dev:api`, suba antes o back-end (`docker compose up db backend` na raiz, ou `./mvnw spring-boot:run` em
`backend/`). Para outro endereço de API: `API_PROXY_TARGET=http://host:porta npm run dev:api`. Pelo
`docker compose up --build` na raiz, o front já sobe ligado à API real em http://localhost:8080, atrás do gateway
Nginx (o gateway serve a SPA e encaminha `/api` ao back-end; ADR-016). Com a stack do compose no ar, o
`dev:api` também pode usar o gateway: `API_PROXY_TARGET=http://localhost:8080/api npm run dev:api`.

Lint e formatação (os mesmos passos do CI):

```bash
npm run lint           # ESLint (eslint.config.js)
npm run format:check   # Prettier (.prettierrc.json); `npm run format` corrige
```

Não há passos extras: o mock já sobe com o seed (README §5.4). **"Reiniciar dados de demonstração"**, no
menu do usuário (canto superior direito), volta ao estado inicial e pede login de novo. Na tela de login há
um seletor que preenche qualquer usuário do seed.

## Usuários do seed (senha `Kingspan@123` para todos)

| Papel | E-mail | Centro |
|---|---|---|
| ADMIN (global) | `admin1@kingspan.test`, `admin2@kingspan.test` | — |
| APROVADOR N1 | `aprov1.ti@kingspan.test`, `aprov1.adm@kingspan.test` | CC-TI-01 / CC-ADM-02 |
| APROVADOR N2 | `aprov2.ti@kingspan.test`, `aprov2.adm@kingspan.test` | CC-TI-01 / CC-ADM-02 |
| SOLICITANTE | `solic.ti@kingspan.test`, `solic.adm@kingspan.test` | CC-TI-01 / CC-ADM-02 |

## O que demonstrar (fluxo operacional)

1. Login como `solic.adm@kingspan.test` → a solicitação "Notebooks para o time de TI" (R$ 24.499,50,
   CC-ADM-02) está pendente na etapa **ADMIN** → aprove como `admin1@` e veja o orçamento de CC-ADM-02
   ser consumido no dashboard.
2. Login como `solic.ti@kingspan.test` → a solicitação "Antivírus corporativo" está em
   **Devolvida p/ ajuste** → edite e submeta: nasce a **v2** (a v1 permanece imutável e consultável).
3. Caixa de aprovação (`aprov1.ti@`): "Kit periféricos" custa R$ 900,00, mas CC-TI-01 só tem R$ 800,00
   disponíveis → aprovar devolve **422 BUDGET_EXCEEDED**, a solicitação continua pendente (nada muda, nem o
   `lockVersion`) e o histórico registra a tentativa.
4. Conflito de concorrência: abra a mesma solicitação em duas abas e aprove nas duas — a segunda recebe
   **409** com o `lockVersion` atual.
5. `CC-TI-01` aparece com orçamento "quase esgotado" (R$ 49.200 de R$ 50.000 — valor real, oriundo de
   uma solicitação APROVADA do seed).

## Logo

`public/logo.svg` é o único arquivo de logo: favicon, cartão de login e barra superior. O arquivo versionado é um
**placeholder neutro**; substitua-o pelo logo oficial (mesmo nome) e nada mais precisa mudar.

## Testes end-to-end (Cypress)

Há duas suítes:

| Suíte | Comando | Contra o quê |
|---|---|---|
| `cypress/e2e/` | `npm run test:e2e` | backend simulado em memória (rápida, sem dependências) |
| `cypress/e2e-api/` | `npm run test:e2e:api` | **API real**: a stack do `docker compose` (gateway Nginx → Spring → PostgreSQL + Redis) |

A suíte da API real precisa da stack no ar e de um banco recém-criado (ela confere os números do seed):

```bash
docker compose down --volumes && docker compose up --build --detach --wait   # na raiz
npm run test:e2e:api                                                         # em frontend/
```

Ela cobre sessão e `returnUrl`, números do dashboard, filtros da listagem, caixa de aprovação, `404` de
visibilidade, o fluxo de 3 etapas pelo formulário, cadeia `SOFTWARE`, segregação de funções, rejeição, `409`,
`BUDGET_EXCEEDED` e reenvio como v2, o "Entrar" pré-preenchido da demonstração, os centros de custo do cadastro
e o uso em **HTTP sem TLS** (18 testes), mais os 41 itens do checklist (`04-checklist`, 59 no total). O CI roda as
duas suítes a cada push.

### Suíte com o backend simulado

```bash
npm run test:e2e   # um comando: sobe o Vite em 127.0.0.1:5174, roda todas as specs headless e encerra
npm run test:e2e -- cypress/e2e/05-request-detail.cy.ts   # só uma spec
npm run dev:e2e    # alternativa interativa: em um terminal…
npm run cy:open    # …e o runner do Cypress em outro
```

Uma spec por tela, em `cypress/e2e/` (10 specs, 108 testes):

| Spec | Tela | O que cobre |
|---|---|---|
| `01-login` | Login | login, credenciais inválidas, validação, cadastro público (sempre Solicitante), nome completo, confirmação e medidor de força da senha, centros de custo do cadastro, logo, `returnUrl`, sessão expirada (401), logout, **site em HTTP sem TLS** (sem `crypto.randomUUID`) |
| `02-dashboard` | Dashboard | totais por status no escopo de cada papel (rascunhos só do dono), orçamento do mês |
| `03-request-list` | Listagem | filtros nos cabeçalhos da tabela antd (status, categoria, centro, título, total), ordenação, tudo refletido na URL, reload preserva o estado, estado vazio, rascunho alheio nunca listado |
| `04-request-form` | Formulário | validação antd (título curto, valor unitário zero vira `0,01`), itens dinâmicos com total ao vivo, criação em Rascunho, edição |
| `05-request-detail` | Detalhe | fluxo do vídeo (N1 → N2 → ADMIN → orçamento consumido), cadeia por valor e categoria, `allowedActions`, rejeição com comentário ≥ 10, devolução → edição → v2 com v1 imutável, `BUDGET_EXCEEDED`, **409**, cancelamento |
| `06-inbox` | Caixa de aprovação | escopo por nível/centro, segregação de funções, 403 para Solicitante |
| `07-admin` | Administração | acesso só ADMIN, usuários, centros de custo, orçamento abaixo do consumido (422) |
| `08-navigation` | Navegação | menu por papel, 404 de rota e de recurso fora da visibilidade (ADR-012), persistência e reinício dos dados |
| `09-security` | Segurança | `returnUrl` hostil (outro domínio, `//`, `javascript:`…) ignorado; `returnUrl` interno preservado com a query string |
| `10-checklist` | Checklist | um teste por item do catálogo de `driven-tests/` (veja abaixo) |

Notas:
- Cada teste começa do seed: o Cypress limpa `localStorage` (banco simulado) e `sessionStorage` (token) entre testes.
- **HTTP sem TLS:** num site `http://` que não é `localhost` o navegador não oferece `crypto.randomUUID`. Os UUIDs
  (`X-Request-Id`, `Idempotency-Key`) vêm de `src/shared/uuid.ts`, com fallback para `crypto.getRandomValues`. As duas
  suítes reproduzem esse cenário com `cy.visitWithoutRandomUUID(url)`.
- Para provocar um **409**, a spec age como um segundo usuário pelo gancho `window.__mockBackend`, exposto só dentro do Cypress.
- `cypress/e2e-runner.mjs` sobe o Vite e roda o Cypress pelas APIs JS (sem matar processos — ferramentas que usam `wmic.exe` quebram no Windows 11 recente). Ele e `cypress/run.mjs` removem `ELECTRON_RUN_AS_NODE` (exportado pelos terminais do VS Code), que impede o Cypress de abrir.
- Se `npm install` não baixar o binário do Cypress (política de install scripts), rode `npx cypress install`.

### Checklist do teste assistido (`driven-tests/`)

Cada teste cujo título começa com o id de um item do catálogo (`[REQ-01] …`, pode haver mais de um) conta como
evidência daquele item. Os testes de `cypress/shared/checklist.ts` rodam **nas duas suítes**
(`e2e/10-checklist.cy.ts` e `e2e-api/04-checklist.cy.ts`), e as specs por tela também levam os ids que cobrem.

```bash
npm run checklist                                    # roda a suíte simulada e gera o relatório
npm run checklist:api                                # idem contra a stack real (docker compose no ar)
CYPRESS_BASE_URL=http://host:8080 node cypress/checklist-runner.mjs --run api \
  --spec cypress/e2e-api/04-checklist.cy.ts           # só o checklist, contra outra stack (ex.: a implantada)
node cypress/checklist-runner.mjs --from cypress/reports/results-mock.json --from cypress/reports/results-api.json   --base ../sessao-testes-pleno.json                 # junta resultados salvos com a sessão manual exportada
```

Saída em `cypress/reports/` (ignorada pelo git):

| Arquivo | Uso |
|---|---|
| `checklist-import.json` | sessão no formato `dt-pleno-v1`: abra `driven-tests/index.html` → **Importar sessão** |
| `checklist-report.md` | para conferir antes: execuções, resultado por item, falhas, mudanças em relação à sessão manual e itens que só se conferem à mão |
| `results-<suíte>.json` | resultado bruto do Cypress, para gerar o relatório de novo sem rodar os testes |

Regras: todas as execuções de um item passaram → **Good**; algumas falharam → **Need Work**; todas falharam →
**Missing**; item sem teste → fica como estava na sessão base (`--base`). O backend simulado não envia cabeçalhos
HTTP e processa chamadas "paralelas" em sequência, então `API-02`, `NFR-01` e `NFR-02` só viram **Good** com a
suíte da API real; a nota de cada item diz de qual suíte veio a evidência. A importação substitui a sessão do
navegador, então use `--base` para não perder resultados manuais; as notas manuais são preservadas. O CI publica
os dois relatórios como artefatos (`checklist-mock` e `checklist-api`).

Na stack real o banco não é zerado entre execuções: os testes do checklist que escrevem dados criam um centro de
custo próprio (com solicitante, aprovadores e orçamento) e só leem o seed, então uma segunda execução também passa.
As specs `01`–`03` da API real conferem números exatos do seed e pressupõem um banco novo, como no CI. Contra uma
stack já usada (seed alterado por testes manuais), rode só o checklist (`--spec …04-checklist.cy.ts`). A suíte
reaproveita um token por usuário: o gateway limita logins por endereço (`GATEWAY_LOGIN_RATE`, 30/min), e um
login a cada chamada esbarraria nesse limite.

## Configuração

- `VITE_MOCK_BACKEND`: sem valor, o mock fica **ligado só no servidor de desenvolvimento** (`npm run dev`,
  Cypress) e **desligado no build de produção** (`npm run build`), porque ele faz login e autorização no
  navegador (docs/security/FINDINGS.md, SEC-F04). `true` força o mock; `false` faz o cliente falar com a API
  real via proxy `/api` → `http://localhost:3000` (ver `vite.config.ts`).
- `VITE_DEMO_LOGIN`: o seletor de usuários de demonstração e o login pré-preenchido seguem a mesma regra
  (ligados no dev/mock, fora do build de produção). Um ambiente de demonstração com backend semeado pode
  usar `VITE_DEMO_LOGIN=true` no build. As duas flags viram constantes em tempo de build (`define` em
  `vite.config.ts`), então o que está desligado nem entra no bundle.

## Estrutura

```
src/
  shared/api/        types.ts (contrato), client.ts (fetch + problem+json), errors.ts
    mock/            domain.ts, data.ts (seed), backend.ts (rotas + regras de negócio)
  shared/auth/       AuthContext (token em sessionStorage, expiração 15 min, 401 → login + returnUrl)
  shared/ui.tsx      kit de UI sobre antd (StatusTag/StepTag, PageHeader, moneyBRL, datas, erros por campo)
  features/
    auth/LoginPage.tsx          register/login (register cria SOLICITANTE)
    dashboard/DashboardPage.tsx totais por status + orçamento do mês + tempo médio
    requests/                   listagem (filtros na URL), formulário (itens dinâmicos + total),
                                detalhe (cadeia, versões, histórico, allowedActions)
    approvals/InboxPage.tsx     caixa de aprovação
    admin/AdminPage.tsx         usuários, centros de custo e orçamentos
```

UI em Ant Design 5: tema por tokens no `ConfigProvider` (`main.tsx`), `App.useApp()` para mensagens,
`Layout` com `Sider`, `Result` para 403/404, formulários com `Form.List`/`Form.useWatch` e erros do servidor
mapeados por campo.

Regras de negócio **não** são reimplementadas no front: os botões vêm de `allowedActions`, erros 422/409
do servidor são exibidos com o `detail` retornado, e totais exibidos no formulário são apenas locais.
