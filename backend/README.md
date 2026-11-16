# Backend — Solicitações de Compra (Java 25 · Spring Boot 4.1)

[![version](https://img.shields.io/github/v/release/ogeidexe/developer-challenge?include_prereleases&sort=semver&label=version)](https://github.com/ogeidexe/developer-challenge/releases) [![ci](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml/badge.svg?branch=teste-pleno)](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml?query=branch%3Ateste-pleno) [![security](https://github.com/ogeidexe/developer-challenge/actions/workflows/security.yml/badge.svg?branch=teste-pleno)](https://github.com/ogeidexe/developer-challenge/actions/workflows/security.yml?query=branch%3Ateste-pleno) [![backend-tests](https://img.shields.io/endpoint?url=https://ogeidexe.github.io/developer-challenge/badges/backend-tests.json)](https://github.com/ogeidexe/developer-challenge/actions/workflows/ci.yml?query=branch%3Ateste-pleno)

API REST do teste: centros de custo com orçamento mensal, cadeia de aprovação sequencial, segregação de
funções, versões imutáveis, histórico append-only, concorrência otimista + escrita condicional e
idempotência. Implementa o contrato de `../docs/api/openapi.yaml` e as decisões de `../docs/adr/`.

> **Status:** compilado e testado no CI (`.github/workflows/ci.yml`: Checkstyle, testes unitários, de integração e
> de concorrência com PostgreSQL real, e `docker compose up` com smoke test). Limitações em
> [Riscos conhecidos](#riscos-conhecidos).

## Stack

| Área | Escolha |
|---|---|
| Linguagem | Java 25 — records, sealed classes, pattern matching em `switch`, variáveis `_`, virtual threads |
| Framework | Spring Boot 4.1.2 (Spring Framework 7, Spring Security 7) |
| Persistência | Spring Data JPA + Hibernate 7, PostgreSQL 16, Flyway (`src/main/resources/db/migration`) |
| Segurança | JWT HS256 de 15 min via OAuth2 Resource Server; BCrypt |
| Erros | `application/problem+json` (RFC 9457) com `code`, `requestId`, `errors[]`, `currentLockVersion` |
| Docs | OpenAPI em `/docs` (springdoc 3) · saúde em `/health` (Actuator, inclui o banco) |
| Testes | JUnit 5 + AssertJ (domínio), Testcontainers PostgreSQL (integração e concorrência) |

## Pré-requisitos

- JDK 25 (o Maven vem pelo wrapper `./mvnw`)
- PostgreSQL 16 para rodar localmente, ou Docker
- Docker para os testes de integração (sem Docker eles são **ignorados**, não falham)

## Variáveis de ambiente

Todas listadas em [`../.env.example`](../.env.example).

| Variável | Padrão | Observação |
|---|---|---|
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/purchase` / `purchase` / `purchase` | |
| `JWT_SECRET` | — (**obrigatória**) | aleatória, ≥ 32 bytes; a aplicação não sobe sem ela nem com um placeholder conhecido |
| `JWT_ISSUER` / `JWT_AUDIENCE` / `JWT_TTL` | `purchase-requests` / `purchase-requests-api` / `PT15M` | `iss` e `aud` são exigidos em todo token |
| `PORT` | `3000` | o proxy do front (`/api` → `:3000`) espera esta porta |
| `SEED_ENABLED` | `true` | cria os dados de demonstração no primeiro start (senha pública: use `false` fora de demo) |
| `LOGIN_MAX_FAILURES_PER_ACCOUNT` / `LOGIN_MAX_FAILURES_PER_CLIENT` / `LOGIN_THROTTLE_WINDOW` | `5` / `50` / `PT15M` | falhas de login antes do `429` (por e-mail / por endereço) |
| `MAX_REQUEST_BODY` | `1MB` | corpo maior → `413` |
| `API_DOCS_ENABLED` | `true` | `false` esconde `/docs` e `/v3/api-docs` |

Controles de segurança e achados da auditoria: [`../docs/security/`](../docs/security/README.md).

## Comandos

```bash
./mvnw test                 # unitários + integração/concorrência (integração requer Docker)
./mvnw verify               # Checkstyle (lint/formatação) + testes + empacotamento — o mesmo que o CI roda
./mvnw checkstyle:check     # só lint/formatação (regras em config/checkstyle.xml)
./mvnw spring-boot:run      # roda local (exporte as variáveis antes)
./mvnw package -DskipTests  # gera target/purchase-requests-*.jar

docker build -t purchase-backend .   # imagem (JDK 25 no build, JRE 25 no runtime, usuário não-root)
```

Banco local rápido:

```bash
docker run -d --name purchase-db -e POSTGRES_DB=purchase -e POSTGRES_USER=purchase -e POSTGRES_PASSWORD=purchase -p 5432:5432 postgres:16-alpine
export JWT_SECRET=$(openssl rand -base64 48)
./mvnw spring-boot:run
```

As migrations (Flyway) e o seed rodam sozinhos no start — nenhum passo manual (README §5.3).

## Usuários do seed (senha `Kingspan@123` para todos)

| Papel | E-mail | Centro |
|---|---|---|
| ADMIN (global) | `admin1@kingspan.test`, `admin2@kingspan.test` | — |
| APROVADOR NIVEL_1 | `aprov1.ti@kingspan.test`, `aprov1.adm@kingspan.test` | CC-TI-01 / CC-ADM-02 |
| APROVADOR NIVEL_2 | `aprov2.ti@kingspan.test`, `aprov2.adm@kingspan.test` | CC-TI-01 / CC-ADM-02 |
| SOLICITANTE | `solic.ti@kingspan.test`, `solic.adm@kingspan.test` | CC-TI-01 / CC-ADM-02 |

`CC-TI-01` fica com R$ 800,00 disponíveis (R$ 49.200 consumidos por uma solicitação APROVADA) para
demonstrar `BUDGET_EXCEEDED`; o fluxo do vídeo (> R$ 10.000) usa "Notebooks para o time de TI", em
`CC-ADM-02`, pendente na etapa ADMIN.

## Exemplos (curl)

```bash
API=http://localhost:3000
TOKEN=$(curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"solic.adm@kingspan.test","password":"Kingspan@123"}' | jq -r .token)

# criar (idempotente: repetir com a mesma chave devolve a MESMA resposta)
curl -s $API/requests -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 6f1c2b9e-1d2a-4f7a-9a51-0f3c8e2d7b10' \
  -d '{"title":"Notebooks","category":"EQUIPMENT","items":[{"description":"Notebook","quantity":5,"unitPrice":"4899.90"}]}'

# listar com filtros, ordenação e paginação
curl -s "$API/requests?status=PENDING_APPROVAL&sort=total,desc&page=0&size=20" -H "Authorization: Bearer $TOKEN"

# submeter / aprovar — sempre com o lockVersion atual (divergente → 409)
curl -s $API/requests/$ID/submit  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lockVersion":1}'
curl -s $API/requests/$ID/approve -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"lockVersion":2,"comment":"De acordo."}'

curl -s $API/approvals/inbox     -H "Authorization: Bearer $TOKEN"
curl -s $API/dashboard/summary   -H "Authorization: Bearer $TOKEN"
curl -s $API/health
```

## Arquitetura

```
domain/        Java puro, sem Spring/JPA/HTTP — máquina de estados, cadeia, políticas, Money, calendário
               (README §5.1: testável sem servidor nem banco)
persistence/   entidades JPA + repositórios Spring Data (SQL de concorrência fica aqui)
application/   casos de uso transacionais (serviços), consultas, idempotência, seed
security/      JWT, filtro de segurança, usuário corrente (sempre recarregado do banco)
api/           controllers, DTOs (records), handler global de problem+json, filtro X-Request-Id
```

Pipeline de toda transição (README §4.3): **401** (filtro) → **404** visibilidade (ADR-012) → **403**
papel/dono → **409** `lockVersion` → **422** regra (estado → nível/centro → segregação → comentário → orçamento).

### Concorrência (ADR-009)

1. **Primeira escrita** de toda transição: `UPDATE purchase_requests SET lock_version = lock_version + 1
   WHERE id = ? AND lock_version = ?` — 0 linhas → 409. Sob READ COMMITTED, o concorrente espera o lock
   da linha e reavalia o `WHERE`: duas aprovações da mesma etapa → exatamente uma passa, a outra recebe
   409 — inclusive na etapa final com orçamento quase zerado.
2. **Orçamento**: `UPDATE budgets SET consumed = consumed + ? WHERE … AND consumed + ? <= amount` — o
   saldo nunca fica negativo; mês sem orçamento = saldo zero. Backstop: `CHECK (consumed <= amount)`.
3. **Etapas**: `UPDATE approval_steps … WHERE id = ? AND status = 'PENDING'` (defesa em profundidade).
4. **Falha de orçamento**: a transação da transição sofre rollback completo; o evento
   `APPROVAL_FAILED_BUDGET` é gravado em **outra** transação (`TransitionFacade` + `REQUIRES_NEW`).
5. **PUT de orçamento**: `SELECT … FOR UPDATE` (lock pessimista) antes de comparar com o consumido.

### Onde cada pedido do enunciado aparece no código

| Tema | Onde |
|---|---|
| OOP / encapsulamento | entidades com construtores e métodos de negócio (`markSubmitted`, `moveTo`), sem setters genéricos |
| Collections / Streams | `EnumMap`/`EnumSet` na máquina de estados; agregações e mapeamentos em `RequestMapper`, `DashboardService` |
| Exceções | hierarquia **sealed** `DomainException` mapeada por `switch` exaustivo em `GlobalExceptionHandler` |
| Generics | `PageResponse<T>` (`from`/`slice`), `Attempt<T>` sealed nos testes de concorrência |
| Multithreading | virtual threads nas requisições; dashboard paraleliza 3 consultas em virtual threads; job agendado de expurgo; testes com `ExecutorService` + `CountDownLatch` |
| SQL / modelagem | `db/migration` (CHECKs, uniques, índice parcial, triggers de imutabilidade); SQL nativo nas escritas condicionais |
| Hibernate | `@Immutable` em versões/itens/eventos, `@CreationTimestamp`, `@Modifying` com `clearAutomatically`, Criteria API (`Specification`), projeções por interface, `@Lock(PESSIMISTIC_WRITE)` |

## Riscos conhecidos

- **Caixa de aprovação** faz uma consulta da cadeia por candidata (N+1) — ok nesta escala; virar um SQL único depois.
- **Poucos testes HTTP:** os de fluxo chamam os serviços, como os controllers fazem; só `SecurityIntegrationTest`
  sobe o servidor completo. Próximo passo:
  testes de contrato dos controllers (status, `problem+json`, `X-Request-Id`).
