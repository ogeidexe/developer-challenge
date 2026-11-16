# RF-09 — Versionamento (v1, v2…)

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.3 (regra 6), §3.1 | FR-022, FR-054, BR-010, DATA-003 | ✅ implementado e testado |

## Descrição

Devolver para ajuste leva a `CHANGES_REQUESTED`. O dono edita e reenvia, o que cria uma **nova versão**. A versão
anterior fica **imutável e consultável**, e a cadeia é recalculada do zero.

## Conceitos

- **Versão** (`versionNumber`: v1, v2…): muda **só** no reenvio. Identifica um snapshot submetido.
- **`lockVersion`**: controle de concorrência; muda a **cada** alteração. Não confundir os dois.

## Regras

- **RN-09.1** O `submit` congela um snapshot imutável: título, descrição, categoria, centro de custo, itens,
  total, mês de competência e a cadeia daquela versão.
- **RN-09.2** O primeiro `submit` cria a v1. O `submit` a partir de `CHANGES_REQUESTED` cria v(n+1), com evento `RESUBMITTED`.
- **RN-09.3** A edição em `CHANGES_REQUESTED` altera só a cópia de trabalho; os snapshots anteriores não mudam.
- **RN-09.4** A nova versão tem cadeia **nova** (pode ser diferente se o total ou a categoria mudaram), e as
  aprovações da versão anterior **não contam**.
- **RN-09.5** `GET /requests/:id/versions` lista as versões; `GET /requests/:id/versions/:n` devolve uma versão
  exatamente como foi submetida.
- **RN-09.6** A imutabilidade é garantida **pelo banco** (trigger que recusa `UPDATE`/`DELETE` nos snapshots),
  não só pela aplicação.
- **RN-09.7** Um reenvio em outro mês muda o mês de competência (RN-08.2).

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-09.1 | uma v1 devolvida na etapa `NIVEL_1` | o dono edita 40 → 35 licenças e reenvia | `PENDING_APPROVAL`, `currentVersion` 2, cadeia nova toda `PENDING` |
| CA-09.2 | a v2 criada | `GET /versions/1` é chamado | a v1 vem com 40 licenças, exatamente como foi submetida |
| CA-09.3 | o aprovador que decidiu na v1 | aprova `NIVEL_1` da v2 | sucesso (segregação é por versão) |
| CA-09.4 | um snapshot no banco | um `UPDATE`/`DELETE` direto é tentado | o banco recusa |
| CA-09.5 | uma v1 com cadeia `[NIVEL_1, NIVEL_2]` | a v2 baixa o total para R$ 500 | a cadeia da v2 é `[NIVEL_1]` |

## Implementação

- `B/application/TransitionService.java` (submit/resubmit), `B/application/PurchaseRequestService.java` (edição)
- `B/persistence/RequestVersionEntity.java`, `B/persistence/VersionItemEntity.java` (`@Immutable`)
- `backend/src/main/resources/db/migration/V4__versions_steps.sql`, `V5__events_immutability.sql` (triggers)
- ADR: [`ADR-011`](../adr/ADR-011-versioning-history-modeling.md)

## Testes

| Critério | Teste |
|---|---|
| CA-09.1, CA-09.2, CA-09.3 | `T/WorkflowIntegrationTest#returnEditResubmitCreatesV2AndKeepsV1Immutable`; `E2E/05-request-detail.cy.ts` ("return → edit → resubmit creates v2") |
| CA-09.3 | `T/domain/ApprovalPoliciesTest#aNewVersionStartsClean` |
| CA-09.4 | `T/WorkflowIntegrationTest#historyAndSnapshotsAreImmutableInTheDatabase` |
| CA-09.5 | ⚠ **lacuna**: sem teste de uma v2 com cadeia diferente da v1 |
