# RNF-02 — Concorrência e transações

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.3 (regra 5), §3.2, §5.1, §5.2 | NFR-006, NFR-015, NFR-021, DATA-001, DATA-002, QA-004 | ✅ atendido e testado |

## Requisito

Transações explícitas nas transições e controle de concorrência justificado em ADR. O sistema continua
correto quando duas pessoas agem ao mesmo tempo, e o saldo nunca fica negativo.

## Estratégia (ADR-009)

Otimista, com **escrita condicional** no banco:

1. **Primeira escrita** de toda transição: `UPDATE purchase_requests SET lock_version = lock_version + 1
   WHERE id = ? AND lock_version = ?`. Nenhuma linha afetada → `409`.
2. **Orçamento:** `UPDATE budgets SET consumed_cents = consumed_cents + ? WHERE … AND consumed_cents + ? <= amount_cents`.
   Nenhuma linha → `422 BUDGET_EXCEEDED`. Garantia final no banco: `CHECK (consumed_cents <= amount_cents)`.
3. **Etapas:** `UPDATE approval_steps … WHERE id = ? AND status = 'PENDING'` (defesa em profundidade).
4. **`PUT` de orçamento:** lock pessimista (`SELECT … FOR UPDATE`) antes de comparar com o consumido.

## Regras verificáveis

- **RN-R02.1** Toda transição (`submit`, `approve`, `reject`, `request-changes`, `cancel`) e o `PUT /requests/:id`
  exigem o `lockVersion` atual no corpo; valor divergente → `409 CONCURRENCY_CONFLICT`, com o
  `currentLockVersion` no corpo para o cliente recarregar.
- **RN-R02.2** Cada caso de uso é **uma** transação (`@Transactional`); falha no meio → rollback total.
- **RN-R02.3** Duas aprovações simultâneas da **mesma etapa** → exatamente uma sucede, a outra recebe `409`,
  mesmo quando é a etapa final e o orçamento está quase zerado (é `409`, não `422`).
- **RN-R02.4** Aprovações finais simultâneas de solicitações **diferentes** no mesmo saldo → as que cabem passam,
  as outras recebem `422 BUDGET_EXCEEDED`; o saldo nunca fica negativo.
- **RN-R02.5** Não há retry automático: o cliente recebe o `409`, recarrega e decide de novo.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-R02.1 | 2 threads com o mesmo `lockVersion` na mesma etapa | aprovam ao mesmo tempo | 1 sucesso e 1 `409`; a etapa tem um único aprovador |
| CA-R02.2 | a etapa final, com saldo para só uma aprovação | 2 threads aprovam ao mesmo tempo | 1 sucesso e 1 `409` (não `422`) |
| CA-R02.3 | saldo para N solicitações e N+k aprovações finais simultâneas | executam | exatamente as que cabem passam; consumido ≤ orçado |

## Implementação

- `B/persistence/PurchaseRequestRepository.java`, `B/persistence/BudgetRepository.java`, `B/persistence/ApprovalStepRepository.java` (SQL condicional)
- `B/application/RequestLock.java`, `B/application/TransitionService.java`, `B/application/TransitionFacade.java`
- ADRs: [008](../adr/ADR-008-transaction-management.md), [009](../adr/ADR-009-concurrency-control.md); detalhes em [`docs/testing/CONCURRENCY-TESTS.md`](../testing/CONCURRENCY-TESTS.md)

## Testes (PostgreSQL real, Testcontainers, `ExecutorService` + `CountDownLatch`)

| Critério | Teste |
|---|---|
| CA-R02.1 | `T/ConcurrencyIntegrationTest#twoApprovalsOfTheSameStepExactlyOneWinsTheOtherGets409` |
| CA-R02.2 | `T/ConcurrencyIntegrationTest#sameFinalStepWithAlmostNoBudgetStillGives409NotBudgetExceeded` |
| CA-R02.3 | `T/ConcurrencyIntegrationTest#finalApprovalsOfDifferentRequestsNeverOverdrawTheBudget` |
| RN-R02.1 | `T/WorkflowIntegrationTest#staleLockVersionIs409AndChangesNothing` |
