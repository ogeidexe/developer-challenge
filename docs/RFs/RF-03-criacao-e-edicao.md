# RF-03 — Criação e edição de solicitações

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.2, §3.1, §3.3 | FR-006…FR-009, FR-051, FR-053, BR-012, DATA-005 | ✅ implementado |

## Descrição

Qualquer usuário autenticado cria uma solicitação de compra com itens. Ela nasce em `DRAFT`, e o **valor
total é sempre calculado pelo back-end**. Só o dono edita, e só em `DRAFT` ou `CHANGES_REQUESTED`.

## Regras

- **RN-03.1** Campos: `title` (3–120), `description` (até 2000, opcional), `category`, `costCenterId`
  (padrão = centro do solicitante), `neededBy` (opcional) e `items[]` (1 a 50 itens).
- **RN-03.2** `category` ∈ `EQUIPMENT | SERVICES | SUPPLIES | TRAVEL | SOFTWARE | OTHER`.
- **RN-03.3** Item: `description` (até 255), `quantity` inteiro de 1 a 1.000.000, `unitPrice` string decimal
  `> 0` com até 2 casas (ex.: `"4899.90"`).
- **RN-03.4** `neededBy`, se informado, deve ser **estritamente depois de hoje** no fuso `America/Sao_Paulo`.
- **RN-03.5** Item = `quantity × unitPrice`; total = soma dos itens; moeda BRL; aritmética exata em centavos.
  Qualquer total enviado pelo cliente é **ignorado**.
- **RN-03.6** A solicitação nasce em `DRAFT`, versão de trabalho 1, `lockVersion` 1, e gera o evento `REQUEST_CREATED`.
- **RN-03.7** `PUT /requests/:id` só é aceito se: o chamador é o dono, o status é `DRAFT` ou
  `CHANGES_REQUESTED`, e o `lockVersion` enviado é o atual. Gera o evento `EDITED`.
- **RN-03.8** Editar **não** cria versão nova; a versão só muda no reenvio (ver [RF-09](RF-09-versionamento.md)).
- **RN-03.9** `POST /requests` aceita `Idempotency-Key` (ver [RNF-03](RNF-03-idempotencia.md)).

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-03.1 | itens `5 × "4899.90"` e um campo `total: "1.00"` no corpo | o usuário cria | recebe `201`, `DRAFT`, total `"24499.50"` |
| CA-03.2 | `quantity: 0`, `unitPrice: "-1"` ou `neededBy` de hoje | o usuário cria | recebe `400` com um erro por campo em `errors[]` |
| CA-03.3 | uma solicitação `PENDING_APPROVAL` | o dono tenta editar | recebe `422 INVALID_TRANSITION` |
| CA-03.4 | um rascunho de outro usuário | alguém tenta ler ou editar | recebe `404 NOT_FOUND` (rascunho invisível) |
| CA-03.5 | um aprovador que **vê** a solicitação | tenta editar | recebe `403 NOT_REQUEST_OWNER` |
| CA-03.6 | um `PUT` com `lockVersion` antigo | é enviado | recebe `409 CONCURRENCY_CONFLICT` e nada muda |
| CA-03.7 | o usuário não informa `costCenterId` | cria | a solicitação fica no centro de custo dele |

## Códigos HTTP

`201` criada · `200` editada · `400 VALIDATION_FAILED` · `403 NOT_REQUEST_OWNER` · `404 NOT_FOUND` ·
`409 CONCURRENCY_CONFLICT` · `422 INVALID_TRANSITION`.

## Implementação

- `B/api/RequestController.java` (`POST /requests`, `PUT /requests/{id}`), `B/api/dto/RequestDtos.java` (validação)
- `B/application/PurchaseRequestService.java`
- `B/domain/Money.java` (centavos exatos), `B/domain/BusinessCalendar.java` (`neededBy`), `B/domain/Category.java`
- Front: `frontend/src/features/requests/RequestFormPage.tsx`

## Testes

| Critério | Teste |
|---|---|
| CA-03.1 | `T/SecurityIntegrationTest#theClientCannotChooseTheTotal`; `T/domain/MoneyAndCalendarTest#totalsAreExactWithoutFloatingPoint` |
| CA-03.2 | `T/domain/MoneyAndCalendarTest#rejectsInvalidAmounts`, `#neededByMustBeStrictlyAfterTheBusinessToday`; `E2E/04-request-form.cy.ts` |
| CA-03.3 | `T/domain/AccessPolicyTest#allowedActionsPerCaller` (ações oferecidas por estado e por chamador) · ⚠ **lacuna**: sem teste de back-end do `422` em `PUT` |
| CA-03.4 | `T/SecurityIntegrationTest#anotherRequesterCannotReadEditSubmitOrCancelSomeoneElsesRequest` |
| CA-03.5 | `T/SecurityIntegrationTest#anApproverWhoCanSeeARequestStillCannotEditIt` |
| CA-03.6 | `T/WorkflowIntegrationTest#staleLockVersionIs409AndChangesNothing` |
| CA-03.7 | `E2E/04-request-form.cy.ts` ("defaults the cost center to the requester…") |
