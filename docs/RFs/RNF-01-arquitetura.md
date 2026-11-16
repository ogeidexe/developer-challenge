# RNF-01 — Arquitetura e domínio isolado

| Origem | IDs relacionados | Status |
|---|---|---|
| README §5.1 | NFR-001, NFR-002, NFR-004, NFR-005, NFR-018…NFR-020, NFR-024 | ✅ atendido |

## Requisito

As regras de domínio ficam **isoladas de HTTP e ORM**: a máquina de estados e a montagem da cadeia são testáveis
sem subir servidor nem banco. Banco relacional, datas em UTC e erros num formato padrão.

## Regras verificáveis

- **RN-R01.1** O pacote `domain/` não importa Spring, JPA (`jakarta.persistence`) nem Servlet.
- **RN-R01.2** Camadas: `api` → `application` → `domain`; `persistence` só é usada por `application`. Os
  controllers não contêm regra de negócio.
- **RN-R01.3** PostgreSQL com migrations Flyway versionadas (`V1`…`V7`); o Hibernate não gera o esquema (`ddl-auto: none`).
- **RN-R01.4** Datas gravadas em UTC (`hibernate.jdbc.time_zone: UTC`); a API usa ISO 8601 com fuso; regras de
  calendário (competência, `neededBy`) usam `America/Sao_Paulo`.
- **RN-R01.5** Erros em `application/problem+json` (RFC 9457) com `type`, `title`, `status`, `detail`, `code`,
  `requestId` e `errors[]` na validação. Nunca expõem stack trace.
- **RN-R01.6** Exceções de domínio formam uma hierarquia **sealed**, mapeada para status HTTP por um `switch` exaustivo.

## Critérios de aceite

| # | Verificação | Resultado esperado |
|---|---|---|
| CA-R01.1 | `grep -rl "import org.springframework\|import jakarta.persistence" backend/src/main/java/com/example/purchase/domain` | nenhum arquivo |
| CA-R01.2 | rodar `T/domain/*Test` | passam sem Spring nem banco (JUnit puro) |
| CA-R01.3 | qualquer erro da API | `Content-Type: application/problem+json` com `code` |
| CA-R01.4 | um erro inesperado (500) | corpo com `code: INTERNAL`, sem stack trace |

## Implementação

- `B/domain/` (Java puro), `B/application/`, `B/persistence/`, `B/api/`
- `B/api/GlobalExceptionHandler.java`, `B/security/ProblemResponses.java`, `B/domain/DomainException.java`
- `backend/src/main/resources/application.yml`, `backend/src/main/resources/db/migration/`
- ADRs: [001](../adr/ADR-001-architecture-style.md), [002](../adr/ADR-002-technology-stack.md), [003](../adr/ADR-003-domain-boundaries.md), [004](../adr/ADR-004-database-modeling.md), [005](../adr/ADR-005-money-representation.md)

## Testes

- `T/domain/*` (5 classes, JUnit puro): `RequestStateMachineTest`, `ApprovalChainBuilderTest`, `ApprovalPoliciesTest`, `AccessPolicyTest`, `MoneyAndCalendarTest`
- CA-R01.1 é verificado por inspeção (não há teste de arquitetura automatizado, como ArchUnit)
