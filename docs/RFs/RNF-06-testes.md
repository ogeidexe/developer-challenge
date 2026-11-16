# RNF-06 — Testes automatizados

| Origem | IDs relacionados | Status |
|---|---|---|
| README §5.2 | NFR-013…NFR-017, QA-001…QA-006, QA-008 | ✅ mínimos atendidos · ⚠ lacunas listadas |

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
| Front-end: ≥ 3 testes significativos | `E2E/*.cy.ts` (9 specs, 54 testes) | ✅ |
| Um comando por lado | `./mvnw verify` · `npm run test:e2e` | ✅ |

## Números (último CI verde)

| Suíte | Testes |
|---|---|
| Back-end (unitários + integração + concorrência + segurança) | 172 |
| Front-end E2E (Cypress) | 54 |
| **Total** | **226** |

Os números são publicados a cada push pelo CI (job summary e badges, ver `.github/workflows/ci.yml`).

## Regras verificáveis

- **RN-R06.1** Os testes de integração usam **PostgreSQL real** via Testcontainers (`T/TestcontainersConfiguration.java`),
  com o banco limpo antes de cada teste (`T/IntegrationTest.java`).
- **RN-R06.2** Os testes de domínio não sobem Spring nem banco (ver [RNF-01](RNF-01-arquitetura.md)).
- **RN-R06.3** Os testes de concorrência disparam as threads juntas (`CountDownLatch`) e verificam o resultado
  **e** o estado final no banco.
- **RN-R06.4** Mensagens `422` são verificadas por asserção (ex.: `DUPLICATE_APPROVER` cita a etapa `NIVEL_1`).

## Lacunas conhecidas (consolidadas dos RF/RNF)

| Área | Falta | Ver |
|---|---|---|
| Caixa de aprovação | teste de back-end de `GET /approvals/inbox` | [RF-10](RF-10-caixa-de-aprovacao.md) |
| Dashboard | teste de back-end de `GET /dashboard/summary` e da média de aprovação | [RF-12](RF-12-dashboard.md) |
| Listagem | ordenação, limite de página e filtros no back-end | [RF-04](RF-04-listagem-e-visibilidade.md) |
| Usuários | `POST`/`PATCH /users` no back-end | [RF-02](RF-02-usuarios-e-papeis.md) |
| Orçamento | `PUT` com `BUDGET_BELOW_CONSUMED` no back-end | [RF-08](RF-08-orcamento.md) |
| `X-Request-Id` | filtro e gravação no evento | [RNF-04](RNF-04-logs-e-request-id.md), [RF-11](RF-11-historico-e-auditoria.md) |
| Contrato HTTP | testes dos controllers (status, `problem+json`) com servidor completo | [RNF-01](RNF-01-arquitetura.md) |
| E2E | specs contra a API real (hoje só contra o backend simulado) | [RF-13](RF-13-interface-web.md) |

## Implementação

- Back-end: `backend/src/test/java/com/example/purchase/` · Front-end: `frontend/cypress/e2e/`
- Estratégia: [`docs/testing/TEST-STRATEGY.md`](../testing/TEST-STRATEGY.md), ADR [014](../adr/ADR-014-testing-architecture.md)
