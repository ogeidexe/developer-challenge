# RF-11 — Histórico e auditoria

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.5, §3.1 | FR-026, FR-027, FR-060, BR-011, DATA-004 | ✅ implementado e testado |

## Descrição

Cada ação sobre uma solicitação gera um evento **append-only** (nunca alterado nem apagado). O histórico é
consultável por solicitação em `GET /requests/:id/history`.

## Regras

- **RN-11.1 Campos do evento:** ator, papel do ator, ação, status de origem, status de destino, etapa (nível e
  sequência), número da versão, comentário, data/hora em **UTC** (`occurredAt`) e o `X-Request-Id` da requisição.
- **RN-11.2 Ações registradas:** `REQUEST_CREATED`, `EDITED`, `SUBMITTED`, `RESUBMITTED`, `APPROVED` (cada
  etapa aprovada), `REJECTED`, `CHANGES_REQUESTED`, `CANCELLED` e `APPROVAL_FAILED_BUDGET` (tentativa recusada por orçamento).
- **RN-11.3** O evento é gravado **na mesma transação** da ação, exceto `APPROVAL_FAILED_BUDGET`, gravado numa
  transação separada para sobreviver ao rollback da aprovação.
- **RN-11.4 Append-only garantido pelo banco:** triggers recusam `UPDATE` e `DELETE` na tabela de eventos,
  inclusive para o dono da tabela.
- **RN-11.5** O histórico segue a visibilidade da solicitação: quem não vê a solicitação recebe `404`.
- **RN-11.6** Eventos em ordem cronológica, com datas ISO 8601 com fuso.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-11.1 | uma solicitação criada, submetida e aprovada em 3 etapas | `GET /history` | eventos `REQUEST_CREATED`, `SUBMITTED`, 3× `APPROVED`, em ordem, com etapa e versão |
| CA-11.2 | uma aprovação recusada por `BUDGET_EXCEEDED` | `GET /history` | há um `APPROVAL_FAILED_BUDGET` e o status continua `PENDING_APPROVAL` |
| CA-11.3 | uma requisição com `X-Request-Id: abc-123` | gera um evento | o evento traz `xRequestId: "abc-123"` |
| CA-11.4 | um evento gravado | um `UPDATE`/`DELETE` direto no banco é tentado | o banco recusa |
| CA-11.5 | uma rejeição com comentário | `GET /history` | o evento `REJECTED` traz o comentário e o papel do ator |

## Implementação

- `B/application/AuditService.java`, `B/persistence/RequestEventEntity.java` (`@Immutable`)
- `B/api/RequestController.java` (`GET /requests/{id}/history`), `B/api/dto/RequestDtos.java` (`EventDto`)
- `B/api/RequestIdFilter.java`, `B/config/RequestContext.java` (origem do `X-Request-Id`)
- `backend/src/main/resources/db/migration/V5__events_immutability.sql` (triggers)
- Front: linha do tempo em `frontend/src/features/requests/RequestDetailPage.tsx`

## Testes

| Critério | Teste |
|---|---|
| CA-11.2 | `T/WorkflowIntegrationTest#budgetExceededKeepsTheRequestPendingAndOnlyAuditsTheAttempt` |
| CA-11.4 | `T/WorkflowIntegrationTest#historyAndSnapshotsAreImmutableInTheDatabase`; `T/SecurityIntegrationTest#decidedApprovalStepsCannotBeRewrittenOrDeleted` (etapas) |
| CA-11.1, CA-11.5, RN-11.5 | `T/RequestRulesIntegrationTest#historyListsEveryActionInOrderWithActorRoleStepVersionAndComment`; `E2E/05-request-detail.cy.ts` |
| CA-11.3 | `T/HttpContractIntegrationTest#theRequestIdOfEachCallIsStoredOnItsHistoryEvent` (HTTP real) |
