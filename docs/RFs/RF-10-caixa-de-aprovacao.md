# RF-10 — Caixa de aprovação

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.4, §3.1 | FR-025, FR-061 | ✅ implementado · ⚠ sem teste de back-end |

## Descrição

`GET /approvals/inbox` lista as solicitações cuja **etapa atual** o usuário logado pode aprovar **agora**, já
aplicando centro de custo, nível e segregação de funções.

## Regras

- **RN-10.1** Só entram solicitações `PENDING_APPROVAL` cuja etapa atual (a primeira `PENDING` da versão atual)
  o usuário pode decidir segundo a elegibilidade de RN-06.2.
- **RN-10.2** Aplica a segregação ([RF-07](RF-07-segregacao-de-funcoes.md)): ficam de fora as solicitações
  do próprio usuário e as que ele já aprovou nesta versão.
- **RN-10.3** `APROVADOR` vê só o próprio centro de custo; `ADMIN` vê todos os centros.
- **RN-10.4** Um `APROVADOR NIVEL_2` vê também as etapas `NIVEL_1` do seu centro.
- **RN-10.5** Etapas futuras não aparecem: uma solicitação em `NIVEL_1` não está na caixa de quem só pode aprovar `NIVEL_2`.
- **RN-10.6** Resposta paginada (mesmo formato de [RF-04](RF-04-listagem-e-visibilidade.md)); filtro opcional por centro de custo.
- **RN-10.7** `SOLICITANTE` não tem caixa de aprovação (no front, sem menu e com página `403` no acesso direto).
- **RN-10.8** A caixa é uma **conveniência de leitura**: a autorização real é reavaliada em cada ação (RN-06.4).

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-10.1 | `aprov1.ti` (`NIVEL_1`, CC-TI-01) | abre a caixa | vê só etapas `NIVEL_1` atuais de CC-TI-01 |
| CA-10.2 | `aprov2.ti` (`NIVEL_2`, CC-TI-01) | abre a caixa | vê etapas atuais `NIVEL_1` e `NIVEL_2` de CC-TI-01 |
| CA-10.3 | uma solicitação de CC-ADM-02 na etapa `NIVEL_1` | `aprov1.ti` abre a caixa | ela não aparece |
| CA-10.4 | `aprov2.ti` aprovou a etapa `NIVEL_1` de uma solicitação | abre a caixa | essa solicitação não aparece mais |
| CA-10.5 | uma solicitação na etapa `ADMIN` criada pelo `admin1` | `admin1` e `admin2` abrem a caixa | aparece só para o `admin2` |
| CA-10.6 | uma solicitação parada na etapa `ADMIN` e sem admin elegível | qualquer caixa | continua pendente; não é erro (RN-06.6) |

## Implementação

- `B/application/InboxService.java` (uma consulta da cadeia por candidata, N+1 conhecido)
- `B/api/WorkflowController.java` (`GET /approvals/inbox`)
- `B/domain/ApprovalPolicies.java`, `B/domain/AccessPolicy.java`
- Front: `frontend/src/features/approvals/InboxPage.tsx`

## Testes

| Critério | Teste |
|---|---|
| CA-10.1…CA-10.4 | `E2E/06-inbox.cy.ts` (backend simulado); CA-10.1 e CA-10.2 também contra a API real em `frontend/cypress/e2e-api/01-seed-and-reads.cy.ts` |
| Regras de base | `T/domain/ApprovalPoliciesTest`, `T/domain/AccessPolicyTest` (as regras que a caixa reutiliza) |
| Todos | ⚠ **lacuna**: nenhum teste de back-end (JUnit) chama `InboxService`; só o E2E contra a API real |
