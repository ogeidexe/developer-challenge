# RF-05 — Montagem da cadeia de aprovação

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.3 (tabela + regra 1) | FR-013…FR-015, BR-004, BR-005, DATA-008, DATA-009 | ✅ implementado e testado |

## Descrição

Ao **submeter** (ou reenviar), o sistema monta a cadeia de etapas **daquela versão** a partir do valor total e da
categoria. As etapas são aprovadas **em ordem**, uma de cada vez. A montagem é uma função pura do domínio.

## Regras

- **RN-05.1 Por valor** (limites exatos, em centavos):

  | Total | Etapas |
  |---|---|
  | até R$ 1.000,00 (≤ 100000 centavos) | `NIVEL_1` |
  | de R$ 1.000,01 a R$ 10.000,00 (100001–1000000) | `NIVEL_1` → `NIVEL_2` |
  | acima de R$ 10.000,00 (> 1000000) | `NIVEL_1` → `NIVEL_2` → `ADMIN` |

- **RN-05.2** Categoria `SOFTWARE` **sempre termina com `ADMIN`**, mesmo abaixo de R$ 10.000,00.
- **RN-05.3** `ADMIN` aparece **no máximo uma vez** e é sempre a última etapa (`SOFTWARE` acima de R$ 10.000 não duplica).
- **RN-05.4** A cadeia é determinística: o mesmo (total, categoria) sempre gera a mesma cadeia.
- **RN-05.5** A cadeia pertence à versão: um reenvio monta uma cadeia **nova, do zero** (ver [RF-09](RF-09-versionamento.md)).
- **RN-05.6** A etapa atual é a primeira `PENDING` da versão atual; as seguintes ficam aguardando.

## Critérios de aceite

| # | Dado (total, categoria) | Quando | Então a cadeia é |
|---|---|---|---|
| CA-05.1 | R$ 1.000,00 · `EQUIPMENT` | submete | `[NIVEL_1]` |
| CA-05.2 | R$ 1.000,01 · `EQUIPMENT` | submete | `[NIVEL_1, NIVEL_2]` |
| CA-05.3 | R$ 10.000,00 · `SERVICES` | submete | `[NIVEL_1, NIVEL_2]` |
| CA-05.4 | R$ 10.000,01 · `SERVICES` | submete | `[NIVEL_1, NIVEL_2, ADMIN]` |
| CA-05.5 | R$ 300,00 · `SOFTWARE` | submete | `[NIVEL_1, ADMIN]` |
| CA-05.6 | R$ 3.000,00 · `SOFTWARE` | submete | `[NIVEL_1, NIVEL_2, ADMIN]` |
| CA-05.7 | R$ 50.000,00 · `SOFTWARE` | submete | `[NIVEL_1, NIVEL_2, ADMIN]` (um `ADMIN` só) |

## Implementação

- `B/domain/ApprovalChainBuilder.java` (Java puro: `LEVEL_1_LIMIT`, `LEVEL_2_LIMIT`)
- `B/domain/StepLevel.java`, `B/domain/StepState.java`
- Persistência das etapas por versão: `B/persistence/ApprovalStepEntity.java`, chamada em `B/application/TransitionService.java` (submit)

## Testes

| Critério | Teste |
|---|---|
| CA-05.1…CA-05.7 | `T/domain/ApprovalChainBuilderTest#buildsTheChainFromValueAndCategory` (parametrizado nos limites) |
| RN-05.3 | `T/domain/ApprovalChainBuilderTest#adminAppearsAtMostOnceAndAlwaysLast` |
| RN-05.4 | `T/domain/ApprovalChainBuilderTest#theChainIsImmutable` |
| Ponta a ponta | `T/WorkflowIntegrationTest#fullThreeStepFlowReachesApprovedAndConsumesTheBudget`; `E2E/05-request-detail.cy.ts` ("SOFTWARE under R$ 1.000 ends with ADMIN") |
