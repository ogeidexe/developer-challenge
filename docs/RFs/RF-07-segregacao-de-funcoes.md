# RF-07 — Segregação de funções

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.3 (regra 3) | FR-017, BR-001, BR-002 | ✅ implementado e testado |

## Descrição

Ninguém aprova a própria solicitação, e a **mesma pessoa não aprova duas etapas da mesma versão**. Vale para
qualquer papel, inclusive `ADMIN`.

## Regras

- **RN-07.1** O solicitante (dono) nunca decide (aprova, rejeita ou devolve) a própria solicitação → `SELF_APPROVAL_FORBIDDEN`.
- **RN-07.2** Quem aprovou uma etapa de uma versão não decide outra etapa **da mesma versão** → `DUPLICATE_APPROVER`.
  Exemplo: um `NIVEL_2` pode aprovar a etapa `NIVEL_1`, mas então não aprova a `NIVEL_2` dessa versão.
- **RN-07.3** A regra vale **por versão**: depois de um reenvio (v2), quem aprovou na v1 pode aprovar de novo.
- **RN-07.4** A caixa de aprovação ([RF-10](RF-10-caixa-de-aprovacao.md)) já aplica a segregação: quem não pode
  decidir não vê a solicitação ali, e o detalhe não oferece os botões de decisão.
- **RN-07.5** A mensagem explica o motivo, por exemplo: *"Não é possível decidir: você já aprovou a etapa NIVEL_1
  desta versão (segregação de funções)."*
- **RN-07.6** A verificação vem depois da elegibilidade (nível/centro) e antes do comentário e do orçamento (RN-06.4).

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-07.1 | um `APROVADOR NIVEL_1` que criou uma solicitação no próprio centro | tenta aprovar | `422 SELF_APPROVAL_FORBIDDEN` |
| CA-07.2 | um `ADMIN` dono de uma solicitação na etapa `ADMIN` | tenta aprovar | `422 SELF_APPROVAL_FORBIDDEN`; o outro `ADMIN` consegue |
| CA-07.3 | um `NIVEL_2` que aprovou a etapa `NIVEL_1` | tenta aprovar a etapa `NIVEL_2` da mesma versão | `422 DUPLICATE_APPROVER` |
| CA-07.4 | o mesmo aprovador, depois de uma devolução e reenvio (v2) | aprova `NIVEL_1` da v2 | sucesso |
| CA-07.5 | o aprovador da CA-07.3 | abre a caixa de aprovação | a solicitação não aparece |

## Implementação

- `B/domain/ApprovalPolicies.java` (verificação e mensagens), `B/domain/AccessPolicy.java` (botões)
- `B/application/InboxService.java` (filtro da caixa), `B/application/TransitionService.java`

## Testes

| Critério | Teste |
|---|---|
| CA-07.1 | `T/domain/ApprovalPoliciesTest#nobodyApprovesTheirOwnRequest`; `T/WorkflowIntegrationTest#segregationOfDuties` |
| CA-07.2 | ⚠ **lacuna**: a verificação não depende do papel, mas não há teste com um `ADMIN` dono |
| CA-07.3 | `T/domain/ApprovalPoliciesTest#theSamePersonCannotApproveTwoStepsOfTheSameVersion`; `T/WorkflowIntegrationTest#segregationOfDuties` |
| CA-07.4 | `T/domain/ApprovalPoliciesTest#aNewVersionStartsClean`; `T/WorkflowIntegrationTest#returnEditResubmitCreatesV2AndKeepsV1Immutable` |
| CA-07.5 | `T/domain/AccessPolicyTest#anApproverWhoAlreadyDecidedAStepGetsNoDecisionButtons`; `E2E/06-inbox.cy.ts` ("segregation of duties…") |
