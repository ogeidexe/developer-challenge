# RNF-06 — Testes automatizados

| Origem | IDs relacionados | Status |
|---|---|---|
| README §5.2 | NFR-013…NFR-017, QA-001…QA-006, QA-008 | ✅ atendido · todos os critérios dos RF com teste |

## Requisito

Testes unitários da máquina de estados e da cadeia, integração com banco real, testes de concorrência e pelo
menos 3 testes de front-end. Cada lado roda com **um único comando**.

## Mínimos do README e onde estão

| Exigência (README §5.2) | Teste | Situação |
|---|---|---|
| Unitários da máquina de estados, **todas** as transições de §4.2, inclusive inválidas | `T/domain/RequestStateMachineTest` (parametrizado) | ✅ |
| Unitários da montagem da cadeia | `T/domain/ApprovalChainBuilderTest` (parametrizado nos limites) | ✅ |
| Integração: fluxo de 3 etapas até `APPROVED` com consumo | `T/WorkflowIntegrationTest#fullThreeStepFlowReachesApprovedAndConsumesTheBudget` | ✅ |
| Integração: segregação (própria solicitação e duas etapas) | `T/WorkflowIntegrationTest#segregationOfDuties` | ✅ |
| Integração: `BUDGET_EXCEEDED` | `T/WorkflowIntegrationTest#budgetExceededKeepsTheRequestPendingAndOnlyAuditsTheAttempt` | ✅ |
| Integração: devolução → edição → reenvio (v2, v1 preservada) | `T/WorkflowIntegrationTest#returnEditResubmitCreatesV2AndKeepsV1Immutable` | ✅ |
| Integração: idempotência do `POST /requests` | `T/WorkflowIntegrationTest#idempotentCreateReplaysTheStoredResponse` | ✅ |
| Concorrência: mesma etapa → exatamente uma sucede, outra `409` | `T/ConcurrencyIntegrationTest#twoApprovalsOfTheSameStepExactlyOneWinsTheOtherGets409` | ✅ |
| Concorrência: solicitações diferentes, mesmo saldo → nunca negativo | `T/ConcurrencyIntegrationTest#finalApprovalsOfDifferentRequestsNeverOverdrawTheBudget` | ✅ |
| Front-end: ≥ 3 testes significativos | `E2E/*.cy.ts` (9 specs, 67 testes, backend simulado) e `frontend/cypress/e2e-api/` (API real) | ✅ |
| Um comando por lado | `./mvnw verify` · `npm run test:e2e` | ✅ |

## Números (último CI verde)

| Suíte | Testes |
|---|---|
| Back-end (unitários + integração + concorrência + segurança + contrato HTTP + seed) | 209 |
| Front-end E2E com o backend simulado (`npm run test:e2e`) | 67 |
| Front-end E2E contra a API real (`npm run test:e2e:api`, stack do compose) | 18 |
| **Total** | **294** |

Os números são publicados a cada push pelo CI (job summary e badges, ver `.github/workflows/ci.yml`).

## Regras verificáveis

- **RN-R06.1** Os testes de integração usam **PostgreSQL real** via Testcontainers (`T/TestcontainersConfiguration.java`),
  com o banco limpo antes de cada teste (`T/IntegrationTest.java`).
- **RN-R06.2** Os testes de domínio não sobem Spring nem banco (ver [RNF-01](RNF-01-arquitetura.md)).
- **RN-R06.3** Os testes de concorrência disparam as threads juntas (`CountDownLatch`) e verificam o resultado
  **e** o estado final no banco.
- **RN-R06.4** Mensagens `422` são verificadas por asserção (ex.: `DUPLICATE_APPROVER` cita a etapa `NIVEL_1`).

## Lacunas conhecidas (consolidadas dos RF/RNF)

Todos os critérios de aceite dos RF têm teste automatizado. O que ainda falta:

| Área | Falta | Ver |
|---|---|---|
| Idempotência | corrida de duas requisições simultâneas com a mesma chave (RN-R03.7) | [RNF-03](RNF-03-idempotencia.md) |
| Erros | um `500` real (só o formato dos `4xx` é testado) e o formato JSON dos logs | [RNF-01](RNF-01-arquitetura.md), [RNF-04](RNF-04-logs-e-request-id.md) |
| Arquitetura | regra "domínio sem Spring/JPA" verificada por inspeção, sem teste automatizado (ex.: ArchUnit) | [RNF-01](RNF-01-arquitetura.md) |
| Front-end | mapeamento dos `errors[]` do servidor para os campos do formulário (CA-13.7); telas de administração só contra o backend simulado | [RF-13](RF-13-interface-web.md) |
| Processo | RNF-07 e RNF-09 são verificados pelo CI e por inspeção, não por testes | [RNF-07](RNF-07-execucao-e-ci.md), [RNF-09](RNF-09-documentacao.md) |

## Testes adicionados para fechar as lacunas

| Classe | Cobre |
|---|---|
| `T/AdminServicesIntegrationTest` | RF-02 (todos os critérios), RF-08 CA-08.5 |
| `T/InboxAndDashboardIntegrationTest` | RF-10 (todos), RF-12 (todos), RF-07 CA-07.2, RF-06 RN-06.6 |
| `T/RequestRulesIntegrationTest` | RF-03 CA-03.3, RF-04 CA-04.3/04.4/04.6, RF-09 CA-09.5, RF-11 CA-11.1/11.5, RNF-03 CA-R03.3/R03.4 |
| `T/HttpContractIntegrationTest` (servidor HTTP real) | RF-01 CA-01.6, RF-02 CA-02.3, RF-11 CA-11.3, RNF-01 CA-R01.3/R01.4, RNF-04 CA-R04.1…R04.4 |
| `T/DemoSeedIntegrationTest` | RNF-08 (todos) |

## Testes adicionados depois das lacunas (sessões, gateway, telas e HTTP puro)

| Teste | Cobre |
|---|---|
| `T/HttpContractIntegrationTest#logoutEndsTheSessionImmediately`, `#eachLoginOpensARedisSessionWithTheTokenLifetime` | RF-01 CA-01.8/01.9 (sessão no Redis) |
| `T/HttpContractIntegrationTest#signUpRequiresAFullNameWithLettersOnly` | RF-01 CA-01.10 (nome completo) |
| `E2E/01-login.cy.ts` (nome, confirmação, medidor de força, centros de custo, logo, regras do "Entrar") | RF-01 CA-01.10…01.12, RF-13 RN-13.12/13.13 |
| `E2E/04-request-form.cy.ts` ("…never keeps a zero unit price (antd rules)") | RF-13 RN-13.12 (valor unitário > 0) |
| `E2E/01-login.cy.ts` e `E2E-API/01-seed-and-reads.cy.ts`, "on a plain-HTTP site (no crypto.randomUUID…)" | RF-13 RN-13.14 / CA-13.8 (site em HTTP sem TLS) |
| CI, job `compose`, passo "frontend starts alone (no backend)" | RNF-07 RN-R07.9 / CA-R07.5 (o contêiner do front sobe sem o back-end) |

## Implementação

- Back-end: `backend/src/test/java/com/example/purchase/` · Front-end: `frontend/cypress/e2e/`
- Estratégia: [`docs/testing/TEST-STRATEGY.md`](../testing/TEST-STRATEGY.md), ADR [014](../adr/ADR-014-testing-architecture.md)
