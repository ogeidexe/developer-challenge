# RF-08 — Orçamento e `BUDGET_EXCEEDED`

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.3 (regra 5), §3.1 | FR-019…FR-021, FR-048, FR-049, BR-006…BR-009, DATA-001, DATA-002 | ✅ implementado · ⚠ `PUT` de orçamento sem teste de back-end |

## Descrição

Cada centro de custo tem um orçamento por mês. A **aprovação da última etapa** consome o total da solicitação
no **mês de competência**, na mesma transação da mudança de estado. O saldo **nunca** fica negativo.

## Regras

- **RN-08.1 Consumo:** acontece **só** na aprovação da última etapa, na **mesma transação** que leva a `APPROVED`.
- **RN-08.2 Mês de competência:** o mês da submissão **da versão atual**, no fuso `America/Sao_Paulo`
  (não UTC). Um reenvio em outro mês muda a competência.
- **RN-08.3** Mês sem orçamento cadastrado tem **saldo zero** (nada é criado automaticamente).
- **RN-08.4 Saldo insuficiente:** a aprovação falha com `422 BUDGET_EXCEEDED`, a solicitação **continua pendente**,
  nada muda (nem o `lockVersion`) e a tentativa é registrada no histórico (`APPROVAL_FAILED_BUDGET`).
- **RN-08.5** A mensagem informa o saldo e o valor: *"O centro de custo CC-TI-01 tem R$ 800,00 disponíveis em
  2026-11; a solicitação exige R$ 900,00."*
- **RN-08.6 Concorrência:** aprovações finais simultâneas de solicitações diferentes disputando o mesmo saldo →
  as que cabem são aprovadas, as que não cabem recebem `422 BUDGET_EXCEEDED`. Detalhes em [RNF-02](RNF-02-concorrencia.md).
- **RN-08.7 Definir orçamento:** `PUT /cost-centers/:id/budgets/:yyyy-mm` (só `ADMIN`) com `{ "amount": "50000.00" }`.
  Valor abaixo do já consumido → `422 BUDGET_BELOW_CONSUMED`. Mês fora de `yyyy-mm` → `400 INVALID_MONTH_FORMAT`.
- **RN-08.8** `GET /cost-centers/:id/budgets/:yyyy-mm` devolve `{ amount, consumed, available }`.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-08.1 | orçamento de R$ 50.000 e uma solicitação de R$ 24.499,50 na última etapa | o aprovador final aprova | `APPROVED` e consumido = R$ 24.499,50 |
| CA-08.2 | saldo de R$ 800,00 e uma solicitação de R$ 900,00 | a última etapa é aprovada | `422 BUDGET_EXCEEDED`, continua `PENDING_APPROVAL`, mesmo `lockVersion`, evento `APPROVAL_FAILED_BUDGET` |
| CA-08.3 | um mês sem orçamento | a última etapa é aprovada | `422 BUDGET_EXCEEDED` (saldo zero) |
| CA-08.4 | uma submissão às 22h de 31/10 em São Paulo (01/11 em UTC) | a competência é calculada | outubro |
| CA-08.5 | consumido R$ 49.200 | o `ADMIN` define o orçamento em R$ 40.000 | `422 BUDGET_BELOW_CONSUMED` |
| CA-08.6 | várias aprovações finais simultâneas que juntas passam do saldo | executam | o saldo nunca fica negativo; as que excedem recebem `422` |

## Implementação

- `B/application/TransitionService.java` (consumo condicional na aprovação final, mensagem)
- `B/application/TransitionFacade.java` (grava `APPROVAL_FAILED_BUDGET` em outra transação, `REQUIRES_NEW`)
- `B/persistence/BudgetRepository.java` (`UPDATE … WHERE consumed + ? <= amount`), `B/persistence/BudgetEntity.java`
- `B/application/CostCenterService.java` (`PUT` com `SELECT … FOR UPDATE`)
- `B/domain/BusinessCalendar.java` (competência em `America/Sao_Paulo`)
- Banco: `backend/src/main/resources/db/migration/V2__budgets.sql` (`CHECK (consumed <= amount)`)

## Testes

| Critério | Teste |
|---|---|
| CA-08.1 | `T/WorkflowIntegrationTest#fullThreeStepFlowReachesApprovedAndConsumesTheBudget`; `E2E/05-request-detail.cy.ts` (fluxo do vídeo) |
| CA-08.2 | `T/WorkflowIntegrationTest#budgetExceededKeepsTheRequestPendingAndOnlyAuditsTheAttempt`; `E2E/05-request-detail.cy.ts` |
| CA-08.3 | `T/WorkflowIntegrationTest#monthWithoutBudgetHasZeroBalance` |
| CA-08.4 | `T/domain/MoneyAndCalendarTest#competenceMonthUsesSaoPauloNotUtc` |
| CA-08.5 | `E2E/07-admin.cy.ts` (contra o backend simulado) · ⚠ **lacuna**: sem teste de back-end para `PUT` de orçamento |
| CA-08.6 | `T/ConcurrencyIntegrationTest#finalApprovalsOfDifferentRequestsNeverOverdrawTheBudget` |
