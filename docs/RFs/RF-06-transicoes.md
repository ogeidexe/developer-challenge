# RF-06 — Transições: submeter, aprovar, rejeitar, devolver, cancelar

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.3 (regras 2, 4, 7), §4.1–§4.3 | FR-016, FR-018, FR-023, FR-055…FR-059, BR-003, BR-014…BR-016, DATA-006, NFR-021 | ✅ implementado e testado |

## Descrição

A solicitação segue uma máquina de estados. Cada ação é validada numa **ordem fixa**, que determina o status HTTP,
e toda ação exige o `lockVersion` atual.

## Estados

`DRAFT` · `PENDING_APPROVAL` · `CHANGES_REQUESTED` · `APPROVED` (final) · `REJECTED` (final) · `CANCELLED` (final)

## Regras

- **RN-06.1 Tabela de transições:**

  | De | Ação | Para | Quem |
  |---|---|---|---|
  | `DRAFT` | `submit` | `PENDING_APPROVAL` | dono |
  | `PENDING_APPROVAL` | `approve` (não é a última etapa) | `PENDING_APPROVAL` | aprovador elegível |
  | `PENDING_APPROVAL` | `approve` (última etapa) | `APPROVED` | aprovador elegível, com orçamento ([RF-08](RF-08-orcamento.md)) |
  | `PENDING_APPROVAL` | `reject` | `REJECTED` | aprovador elegível |
  | `PENDING_APPROVAL` | `request-changes` | `CHANGES_REQUESTED` | aprovador elegível |
  | `CHANGES_REQUESTED` | `submit` | `PENDING_APPROVAL` (nova versão) | dono |
  | `DRAFT`, `PENDING_APPROVAL`, `CHANGES_REQUESTED` | `cancel` | `CANCELLED` | dono ou `ADMIN` |
  | `APPROVED`, `REJECTED`, `CANCELLED` | qualquer | — | **bloqueado** |

- **RN-06.2 Elegibilidade por etapa:**
  - `NIVEL_1`: `APROVADOR` `NIVEL_1` ou `NIVEL_2` **do mesmo centro de custo**, ou `ADMIN`;
  - `NIVEL_2`: `APROVADOR` `NIVEL_2` do mesmo centro de custo, ou `ADMIN`;
  - `ADMIN`: somente `ADMIN`.
- **RN-06.3 Comentário:** opcional ao aprovar; **obrigatório, com pelo menos 10 caracteres** (sem contar espaços
  nas pontas) ao rejeitar ou devolver.
- **RN-06.4 Ordem de verificação:** `401` autenticação → `404` existência/visibilidade → `403` papel/dono →
  `409` `lockVersion` → `422` regra de negócio (estado → nível/centro → segregação → comentário → orçamento).
- **RN-06.5** Mensagens `422` explicam o motivo, por exemplo: *"Não é possível decidir: a etapa NIVEL_2 exige …"*.
- **RN-06.6 Sem aprovador elegível** (ex.: etapa `ADMIN` e o único admin é o dono): a etapa continua pendente.
  **Não é erro**; por isso o seed tem dois `ADMIN`.
- **RN-06.7** Toda transição grava um evento no histórico ([RF-11](RF-11-historico-e-auditoria.md)) e incrementa o `lockVersion`.
- **RN-06.8** Um `ADMIN` só cancela o que vê: rascunho alheio é invisível (`404`), então na prática só o dono cancela um `DRAFT`.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-06.1 | qualquer par (estado, ação) fora da tabela | a ação é chamada | `422 INVALID_TRANSITION` com o motivo |
| CA-06.2 | uma solicitação `APPROVED` | qualquer ação | `422 INVALID_TRANSITION` e o orçamento não é consumido de novo |
| CA-06.3 | um `SOLICITANTE` que vê a solicitação | chama `approve` | `403 FORBIDDEN` |
| CA-06.4 | um `APROVADOR NIVEL_1` na etapa `NIVEL_2` | chama `approve` | `422 APPROVER_NOT_ELIGIBLE`, explicando quem pode aprovar |
| CA-06.5 | um comentário de 9 caracteres | chama `reject` ou `request-changes` | `422 COMMENT_REQUIRED` |
| CA-06.6 | um `lockVersion` desatualizado | chama qualquer transição | `409 CONCURRENCY_CONFLICT` e nada muda |
| CA-06.7 | etapa `NIVEL_1` aprovada numa cadeia de 2 | o `NIVEL_2` aprova | a solicitação vai a `APPROVED` (com orçamento) |
| CA-06.8 | uma rejeição válida | é feita | `REJECTED`, e as etapas restantes não podem mais ser decididas |

## Códigos HTTP

`200` · `401` · `403 FORBIDDEN` / `NOT_REQUEST_OWNER` · `404 NOT_FOUND` · `409 CONCURRENCY_CONFLICT` ·
`422 INVALID_TRANSITION` / `APPROVER_NOT_ELIGIBLE` / `COMMENT_REQUIRED` (e os de [RF-07](RF-07-segregacao-de-funcoes.md) e [RF-08](RF-08-orcamento.md)).

## Implementação

- `B/domain/RequestStateMachine.java` (tabela), `B/domain/ApprovalPolicies.java` (elegibilidade, comentário, mensagens)
- `B/domain/AccessPolicy.java` (`allowedActions`), `B/domain/Action.java`, `B/domain/RequestStatus.java`
- `B/application/TransitionService.java`, `B/application/TransitionFacade.java`
- `B/api/RequestController.java` (`/submit`, `/approve`, `/reject`, `/request-changes`, `/cancel`)

## Testes

| Critério | Teste |
|---|---|
| CA-06.1 | `T/domain/RequestStateMachineTest#followsTheTransitionTable` (parametrizado: todas as transições, válidas e inválidas) |
| CA-06.2 | `T/domain/RequestStateMachineTest#finalStatesBlockEverything`; `T/SecurityIntegrationTest#terminalRequestsCannotBeChangedOrDecidedAgainAndBudgetIsConsumedOnce` |
| CA-06.3 | `T/SecurityIntegrationTest#aSolicitanteCannotDecideEvenARequestTheyCanSee` |
| CA-06.4 | `T/domain/ApprovalPoliciesTest#matrix`, `#rejectionExplainsWhoMayApprove` |
| CA-06.5 | `T/domain/ApprovalPoliciesTest#atLeastTenCharactersOnRejectAndReturn`, `#optionalOnApprove`; `T/WorkflowIntegrationTest#rejectNeedsAMeaningfulCommentAndClosesTheChain` |
| CA-06.6 | `T/WorkflowIntegrationTest#staleLockVersionIs409AndChangesNothing`; `E2E/05-request-detail.cy.ts` ("409: someone acted first") |
| CA-06.7, CA-06.8 | `T/WorkflowIntegrationTest#fullThreeStepFlowReachesApprovedAndConsumesTheBudget`, `#rejectNeedsAMeaningfulCommentAndClosesTheChain` |
| RN-06.6 | `T/InboxAndDashboardIntegrationTest#aStepWithoutAnEligibleApproverStaysPendingWithoutError` |
