# SOLUTION — Sistema de Solicitações de Compra

[![ci](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml/badge.svg?branch=teste-pleno)](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml?query=branch%3Ateste-pleno) [![security](https://github.com/ogeidexe/developer-challenge/actions/workflows/security.yml/badge.svg?branch=teste-pleno)](https://github.com/ogeidexe/developer-challenge/actions/workflows/security.yml?query=branch%3Ateste-pleno)

Módulo de solicitações de compra com orçamento mensal por centro de custo, cadeia de aprovação sequencial
(valor + categoria), segregação de funções, versões imutáveis, histórico append-only, controle de
concorrência e idempotência.

| Camada | Stack |
|---|---|
| Back-end | Java 25 · Spring Boot 4.1 · Spring Security (JWT HS256 + sessões no Redis) · JPA/Hibernate · Flyway · PostgreSQL 17 · Redis 7 |
| Front-end | React 18 · TypeScript · Vite 5 · Ant Design 5 · TanStack Query |
| Testes | JUnit 5 + AssertJ (unitários), Testcontainers PostgreSQL + Redis (integração, concorrência, HTTP), Cypress (E2E) |
| Entrega | Docker Compose com gateway Nginx (proxy reverso) · GitHub Actions (CI, segurança, release) |

---

## 1. Como rodar

### 1.1 Com Docker Compose (recomendado)

Pré-requisito: Docker com Compose v2.

```bash
docker compose up --build
```

Nenhum passo manual: PostgreSQL e Redis sobem, o back-end aplica as migrations Flyway e cria o seed (§3) na
primeira subida, e o gateway só abre quando o back-end está pronto (`/health` com HTTP 200, depois do seed).

Todo o tráfego HTTP passa por um **gateway Nginx** (proxy reverso, [ADR-016](docs/adr/ADR-016-nginx-gateway.md)),
o único serviço publicado:

```
navegador ──► gateway Nginx :8080 ──┬─ /                   ─► front-end (SPA estática)
                                    ├─ /api/*              ─► back-end (prefixo /api removido)
                                    └─ /health, /docs      ─► back-end
back-end ──► PostgreSQL (dados) e Redis (sessões do JWT)
```

| O quê | URL |
|---|---|
| Aplicação (SPA) | <http://localhost:8080> |
| API | <http://localhost:8080/api> (ex.: `POST /api/auth/login`) |
| OpenAPI / Swagger UI | <http://localhost:8080/docs> |
| Health (app + banco + Redis) | <http://localhost:8080/health> |

- **Variáveis:** todas têm padrão de demonstração local. Para mudar alguma, copie `.env.example` para
  `.env` (porta: `HTTP_PORT`; limite de login no gateway: `GATEWAY_LOGIN_RATE`). Back-end, front-end e
  Redis não ficam expostos no host; o PostgreSQL fica só em `127.0.0.1:5432`.
- **`JWT_SECRET`:** nenhum segredo está commitado. Se o `.env` não definir um, o serviço `jwt-secret`
  gera um aleatório (48 bytes) na primeira subida e o guarda num volume, então os tokens continuam válidos
  depois de reiniciar. O back-end se recusa a subir com segredo curto ou com placeholder documentado.
- **Login de demonstração:** no compose, a tela "Entrar" já vem preenchida com o usuário principal do seed
  (`admin1@kingspan.test` / `Kingspan@123`) e oferece o seletor de usuários do seed. Para desligar:
  `VITE_DEMO_LOGIN=false docker compose up --build`. Builds de produção fora do compose seguem sem isso (SEC-F04).
- **Zerar tudo** (banco, seed e segredo): `docker compose down --volumes`.

### 1.2 Local, sem Docker para as aplicações

Pré-requisitos: JDK 25, Node 22, um Redis (`docker run -p 6379:6379 redis:7.4-alpine`) e um PostgreSQL (o do compose serve: `docker compose up db`, publicado em
`127.0.0.1:5432`; ou um PostgreSQL local com banco/usuário/senha `purchase`).

```bash
# back-end (http://localhost:3000)
cd backend
export JWT_SECRET="$(openssl rand -base64 48)"   # demais variáveis: ../.env.example
./mvnw spring-boot:run
```

```bash
# front-end (http://localhost:5173)
cd frontend
npm install
npm run dev        # usa o backend simulado em memória (sem API)
npm run dev:api    # usa a API real em http://localhost:3000 (proxy /api)
```

Detalhes, variáveis e exemplos `curl`: [`backend/README.md`](backend/README.md) e
[`frontend/README.md`](frontend/README.md).

### 1.3 Testes, lint e formatação (um comando por lado)

| Lado | Comando | O que roda |
|---|---|---|
| Back-end | `cd backend && ./mvnw verify` | Checkstyle + unitários + integração e concorrência com PostgreSQL real (Testcontainers, requer Docker) |
| Front-end | `cd frontend && npm run test:e2e` | sobe o Vite e roda as specs Cypress headless (backend simulado) |
| Integração | `cd frontend && npm run test:e2e:api` | Cypress contra a stack do compose (API real), com a stack no ar |
| Front-end | `npm run lint` · `npm run format:check` | ESLint · Prettier |

O CI (`.github/workflows/ci.yml`) roda tudo isso a cada push, além de `docker compose up --build` com um
smoke test (health, login e chamadas autenticadas pelo proxy do front).

---

## 2. Visão geral da solução

```
backend/src/main/java/com/example/purchase/
  domain/        Java puro (sem Spring/JPA/HTTP): máquina de estados, montagem da cadeia, políticas de
                 aprovação e visibilidade, Money, calendário — testável sem servidor nem banco (README §5.1)
  application/   casos de uso transacionais, consultas, idempotência, caixa de aprovação, dashboard
  persistence/   entidades JPA e repositórios; o SQL das escritas condicionais (concorrência) fica aqui
  security/      JWT, usuário corrente (sempre recarregado do banco), limite de tentativas de login
  api/           controllers, DTOs (records), problem+json (RFC 9457), filtro X-Request-Id
frontend/src/
  features/      telas por caso de uso (auth, dashboard, requests, approvals, admin)
  shared/        cliente HTTP, autenticação, tipos do contrato, backend simulado (só em dev/E2E)
docs/            ADRs, contrato OpenAPI, modelagem do banco, estratégia de testes, auditoria de segurança
```

**Ordem de verificação de toda transição (README §4.3):** `401` (filtro JWT) → `404` fora da visibilidade
(ADR-012) → `403` papel/dono → `409` `lockVersion` divergente → `422` regra de negócio, com `code`
específico e mensagem que explica o motivo.

**O front não reimplementa regras:** o detalhe da solicitação traz `allowedActions`, calculado no domínio
(`AccessPolicy`), e a interface só renderiza o que a API permite.

---

## 3. Usuários do seed

Dados fictícios, criados pelos próprios serviços (histórico, versões, etapas e consumo de orçamento são
reais). **Senha de todos: `Kingspan@123`** (pública: use `SEED_ENABLED=false` fora de demonstração).

| Papel | E-mail | Centro de custo |
|---|---|---|
| ADMIN (global) | `admin1@kingspan.test`, `admin2@kingspan.test` | — |
| APROVADOR `NIVEL_1` | `aprov1.ti@kingspan.test` · `aprov1.adm@kingspan.test` | CC-TI-01 · CC-ADM-02 |
| APROVADOR `NIVEL_2` | `aprov2.ti@kingspan.test` · `aprov2.adm@kingspan.test` | CC-TI-01 · CC-ADM-02 |
| SOLICITANTE | `solic.ti@kingspan.test` · `solic.adm@kingspan.test` | CC-TI-01 · CC-ADM-02 |

Cenários prontos:

- **CC-TI-01** com orçamento quase esgotado: R$ 800,00 disponíveis de R$ 50.000,00. Aprovar "Kit
  periféricos estoque" (R$ 900,00) como `aprov1.ti@` → `422 BUDGET_EXCEEDED`, e a solicitação continua pendente.
- **Fluxo de 3 etapas:** "Notebooks para o time de TI" (R$ 24.499,50, CC-ADM-02) pendente na etapa
  `ADMIN`; aprove como `admin1@` e veja o orçamento ser consumido no dashboard.
- **Devolução → v2:** "Antivírus corporativo" (`solic.ti@`) em `CHANGES_REQUESTED`; edite e reenvie.
- Solicitações de exemplo em todos os estados.

---

## 4. Principais decisões e trade-offs

As decisões completas estão em [`docs/adr/`](docs/adr/) (16 ADRs).

| Tema | Decisão | Trade-off | ADR |
|---|---|---|---|
| Concorrência | **Otimista com escrita condicional:** a primeira escrita de toda transição é `UPDATE … WHERE id=? AND lock_version=?` (0 linhas → `409`). Orçamento: `UPDATE budgets SET consumed = consumed + ? WHERE … AND consumed + ? <= amount`, mais um `CHECK (consumed <= amount)` como garantia final. `PUT` de orçamento usa `SELECT … FOR UPDATE`. | Sem locks longos e sem retries; exige SQL nativo nas escritas críticas em vez de só `@Version`. | [009](docs/adr/ADR-009-concurrency-control.md) |
| Versões e histórico | A linha da solicitação é a cópia editável; o `submit` congela um **snapshot imutável** (versão n, itens, cadeia e mês de competência). Eventos append-only, e a imutabilidade é **garantida por trigger no banco**. | Mais tabelas, mas a v1 fica consultável exatamente como foi aprovada ou devolvida. | [011](docs/adr/ADR-011-versioning-history-modeling.md) |
| `403` × `404` | Recurso fora da visibilidade → **`404`** (não revela existência); dentro da visibilidade, mas sem permissão para a ação → `403`. | O cliente não distingue "não existe" de "não pode ver", e isso é intencional. | [012](docs/adr/ADR-012-403-vs-404.md) |
| Dinheiro | Centavos em `bigint`; `Money` no domínio com aritmética exata; JSON como string `"4899.90"`. | Conversão na borda, mas sem erro de ponto flutuante. | [005](docs/adr/ADR-005-money-representation.md) |
| Idempotência | Tabela `idempotency_keys` (usuário + chave + hash do payload); repetição devolve a resposta gravada, payload diferente → `409`; validade de 24 h com job de expurgo. | Uma escrita a mais por criação. | [010](docs/adr/ADR-010-idempotency-strategy.md) |
| Transações | Um `@Transactional` por caso de uso; uma falha de orçamento faz rollback da transição, e o evento `APPROVAL_FAILED_BUDGET` é gravado em outra transação (`REQUIRES_NEW`). | Dois commits nesse caminho, mas a tentativa fica auditada. | [008](docs/adr/ADR-008-transaction-management.md) |
| Arquitetura | Monólito em camadas, com o domínio isolado de HTTP e ORM. | Simples de rodar e testar; separar em módulos seria o próximo passo se crescesse. | [001](docs/adr/ADR-001-architecture-style.md), [003](docs/adr/ADR-003-domain-boundaries.md) |
| Autenticação | JWT HS256 de 15 min (`sub`, `role`, `costCenterId`, `approverLevel`, `aud`, `iss`); o usuário é recarregado do banco a cada requisição, então uma mudança de papel vale na hora. | Sem refresh token: o usuário faz login de novo depois de 15 min. | [006](docs/adr/ADR-006-authentication-strategy.md), [007](docs/adr/ADR-007-authorization-strategy.md) |
| Sessões | Cada token abre uma sessão no **Redis** (`session:<jti>`, mesmo TTL); o token só vale enquanto a sessão existe. `POST /auth/logout` encerra a sessão: logout e revogação reais. | Uma consulta ao Redis por requisição; sem Redis, os tokens são recusados (falha fechada, visível no `/health`). | [015](docs/adr/ADR-015-redis-sessions.md) |
| Entrada HTTP | **Gateway Nginx** como única porta: roteia SPA e API, cabeçalhos de segurança, gzip, limite de corpo, `X-Request-Id` e limite de login por IP. | Um salto a mais; config inline no `docker-compose.yml`. | [016](docs/adr/ADR-016-nginx-gateway.md) |

**Logs e operação:** logs JSON estruturados (ECS) com `requestId` no MDC; `X-Request-Id` é gerado quando
não vem na requisição e é devolvido na resposta e gravado em cada evento do histórico.

### Diferenciais implementados

- Testes E2E (Cypress) cobrindo os fluxos por papel, `409`/`422` e segurança
- Telas de administração no front (usuários, centros de custo e orçamentos)
- Filtros extras na listagem: `minAmount`, `maxAmount`, `q`
- Tempo médio de aprovação no dashboard
- Histórico append-only garantido pelo banco (triggers)
- Rate limit no login (por conta e por cliente no back-end, por IP no gateway Nginx)
- Logout e revogação de token reais (sessões no Redis)
- Pipeline de segurança (npm audit, dependency review, gitleaks, CodeQL, OWASP Dependency-Check, hadolint),
  descrito em [`docs/security/SECURITY-PIPELINE.md`](docs/security/SECURITY-PIPELINE.md)

---

## 5. O que ficou de fora e limitações conhecidas

- **Testes de integração no nível de serviço:** os testes de fluxo chamam os serviços de aplicação, como
  os controllers fazem; testes HTTP com servidor completo existem só para a segurança (`SecurityIntegrationTest`).
- **A maior parte dos testes E2E roda contra o backend simulado em memória.** A suíte contra a API real
  (`cypress/e2e-api/`) cobre os fluxos principais, mas não todas as telas (administração, por exemplo, só
  é testada contra o simulado).
- **Caixa de aprovação com N+1:** uma consulta da cadeia por candidata. Serve para esta escala, mas
  deveria virar um SQL único.
- **Sem outbox e sem job de SLA** (diferenciais não escolhidos).
- **Atrás do gateway, o limite de login por cliente do back-end enxerga o IP do gateway**, porque o back-end
  ignora `X-Forwarded-For` de propósito (falsificável). O limite por IP fica no gateway (`limit_req`).
- **Sem TLS no gateway** (demonstração local) e **sem refresh token**: o logout encerra a sessão atual, mas
  não há "sair de todas as sessões" de um usuário. A SPA funciona em HTTP puro num host público (sem
  `crypto.randomUUID`, ver RF-13 RN-13.14), mas em produção o gateway deve terminar TLS: em HTTP o token e as
  senhas trafegam em claro.

## 6. O que eu faria com mais tempo

1. Testes de contrato HTTP dos controllers (status, `problem+json`, `X-Request-Id`) e ampliar a suíte E2E
   contra a API real para todas as telas.
2. Caixa de aprovação em uma única consulta, e índices revisados com `EXPLAIN` sobre volume real.
3. Transactional outbox para notificar mudanças de estado e um job de SLA (pendências acima de 3 dias úteis).
4. Refresh token com rotação e revogação.
5. Métricas (Micrometer/Prometheus) e tracing (OpenTelemetry).

---

## 7. Mapa do repositório

| Caminho | Conteúdo |
|---|---|
| `backend/` | API Spring Boot ([README](backend/README.md)) |
| `frontend/` | SPA React ([README](frontend/README.md)) |
| `docs/adr/` | decisões de arquitetura |
| `docs/RFs/` | requisitos funcionais e não funcionais detalhados, com critérios de aceite e os testes que cobrem cada um ([índice](docs/RFs/README.md)) |
| `driven-tests/` | roteiro de testes manuais (abra `driven-tests/index.html`): checklist com os 81 testes do desafio, estados Good / Missing / Need Work, notas e relatório final (PDF, Markdown, JSON) |
| `docs/api/openapi.yaml` | contrato da API (também servido em `/docs`) |
| `docs/` | requisitos, modelagem do banco, testes, segurança ([índice](docs/README.md)) |
| `docker-compose.yml` | gateway Nginx (config inline) + front-end + back-end + PostgreSQL + Redis |
| `.github/workflows/` | `ci.yml` (build, lint, testes, compose), `security.yml`, `release.yml` (tag `vX.Y.Z` → GitHub Release + imagens no GHCR) |
