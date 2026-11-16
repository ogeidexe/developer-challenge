# RF-12 — Dashboard

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.6, §6 | FR-028…FR-030, FR-062 | ✅ implementado e testado |

## Descrição

`GET /dashboard/summary` devolve os totais por status e o orçamento do **mês corrente** por centro de custo, no
escopo do papel de quem chama.

## Regras

- **RN-12.1 Totais por status**, no escopo do papel: `SOLICITANTE` conta as próprias; `APROVADOR` conta as do seu
  centro de custo; `ADMIN` conta todas. Rascunhos alheios nunca entram (mesma visibilidade de RN-04.1/RN-04.2).
- **RN-12.2 Orçamento do mês corrente** (fuso `America/Sao_Paulo`) por centro de custo: **orçado** (`amount`),
  **consumido** (`consumed`) e **disponível** (`available`). Mês sem orçamento aparece com zero.
- **RN-12.3** Escopo do orçamento: `ADMIN` vê todos os centros; os demais papéis veem só o próprio centro.
- **RN-12.4 Diferencial:** `averageApprovalTimeDays` = média de dias entre a **primeira** submissão e a decisão
  final (`APPROVED` ou `REJECTED`), para decisões dos últimos 30 dias; `null` se não houver nenhuma.
- **RN-12.5** Formato: `{ totals: [{status, count}], budgets: [{costCenterId, code, name, month, amount, consumed, available}], averageApprovalTimeDays }`.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-12.1 | o seed | o `admin1` abre o dashboard | totais de todas as solicitações não-rascunho e orçamento dos 2 centros |
| CA-12.2 | o seed | o `solic.ti` abre o dashboard | só as próprias solicitações e só o orçamento de CC-TI-01 |
| CA-12.3 | o seed | o `aprov1.ti` abre o dashboard | solicitações de CC-TI-01, sem rascunhos de outras pessoas |
| CA-12.4 | CC-TI-01 com R$ 49.200 consumidos de R$ 50.000 | o dashboard é aberto | orçado 50000.00, consumido 49200.00, disponível 800.00 |
| CA-12.5 | uma aprovação final | o dashboard é recarregado | o consumido do centro aumenta pelo total da solicitação |

## Implementação

- `B/application/DashboardService.java` (3 consultas em paralelo com virtual threads)
- `B/api/WorkflowController.java` (`GET /dashboard/summary`), `B/api/dto/RequestDtos.java` (`DashboardSummary`)
- Front: `frontend/src/features/dashboard/DashboardPage.tsx`

## Testes

| Critério | Teste |
|---|---|
| CA-12.1…CA-12.3 | `T/InboxAndDashboardIntegrationTest#totalsByStatusFollowTheCallersVisibility`; `E2E/02-dashboard.cy.ts`; API real em `frontend/cypress/e2e-api/01-seed-and-reads.cy.ts` |
| CA-12.4 | `T/InboxAndDashboardIntegrationTest#budgetsShowAmountConsumedAndAvailableInTheCallersScope`; API real em `frontend/cypress/e2e-api/01-seed-and-reads.cy.ts` |
| CA-12.5 | `T/InboxAndDashboardIntegrationTest#budgetsShowAmountConsumedAndAvailableInTheCallersScope`; `E2E/05-request-detail.cy.ts` |
| RN-12.4 | `T/InboxAndDashboardIntegrationTest#averageApprovalTimeIsNullWithoutDecisionsAndFilledAfterOne` |
