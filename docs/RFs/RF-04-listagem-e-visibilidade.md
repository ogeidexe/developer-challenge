# RF-04 — Listagem e visibilidade

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.2, §3.2 | FR-010…FR-012, FR-050, FR-052, BR-013, NFR-019, NFR-023 | ✅ implementado · ⚠ filtros sem teste de back-end |

## Descrição

`GET /requests` lista as solicitações **visíveis** ao usuário, paginadas, ordenadas e filtradas no servidor.
`GET /requests/:id` devolve o detalhe da versão atual, as etapas, `allowedActions` e `lockVersion`.

## Regras

- **RN-04.1 Visibilidade:** `SOLICITANTE` vê as próprias; `APROVADOR` vê as do seu centro de custo; `ADMIN` vê todas.
- **RN-04.2** **Rascunhos (`DRAFT`) só são visíveis para o dono**, sem exceção, nem para o `ADMIN` (ADR-012).
- **RN-04.3** Recurso inexistente **ou fora da visibilidade** → `404` (não revela que existe; ADR-012).
- **RN-04.4 Paginação:** `?page=0&size=20&sort=createdAt,desc` → `{ data, page, size, totalElements, totalPages }`.
  `size` é limitado a 1–100; `page` negativo vira 0.
- **RN-04.5 Ordenação:** só os campos `createdAt`, `title`, `total`, `status`, `submittedAt`, com `asc` ou `desc`.
  Padrão `createdAt,desc`. Outro campo → `400 INVALID_SORT`.
- **RN-04.6 Filtros obrigatórios:** `status`, `category`, `costCenterId` (aceita vários, separados por vírgula),
  `createdFrom`, `createdTo` (datas inclusivas, no fuso `America/Sao_Paulo`).
- **RN-04.7 Filtros extras (diferencial):** `minAmount`, `maxAmount` e `q` (busca no título, sem diferenciar
  maiúsculas). Os curingas `%` e `_` em `q` são tratados como texto literal.
- **RN-04.8** Os filtros nunca ampliam a visibilidade: são aplicados **dentro** do escopo da RN-04.1.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-04.1 | um rascunho do `solic.ti` | o `admin1` lista ou abre por id | o rascunho não aparece; o detalhe dá `404` |
| CA-04.2 | um `APROVADOR` de CC-TI-01 | abre uma solicitação de CC-ADM-02 | recebe `404` e ela não aparece na lista |
| CA-04.3 | `sort=password,asc` | a lista é pedida | recebe `400 INVALID_SORT` |
| CA-04.4 | `size=1000` | a lista é pedida | recebe no máximo 100 itens, com `size: 100` |
| CA-04.5 | `q=100%` | a lista é pedida | só aparecem títulos que contêm literalmente "100%" |
| CA-04.6 | filtros `status=PENDING_APPROVAL&category=SOFTWARE` | um aprovador lista | só vêm itens do centro dele que atendem aos dois filtros |
| CA-04.7 | o detalhe de uma solicitação visível | é aberto | traz `allowedActions` calculado para **quem** chama e o `lockVersion` atual |

## Códigos HTTP

`200` · `400 VALIDATION_FAILED` / `INVALID_SORT` · `401` · `404 NOT_FOUND`.

## Implementação

- `B/api/RequestController.java` (`GET /requests`, `GET /requests/{id}`)
- `B/application/RequestQueryService.java`, `B/application/RequestSpecifications.java` (filtros, ordenação, escape de curingas)
- `B/domain/AccessPolicy.java` (visibilidade e `allowedActions`), `B/application/RequestAccess.java`
- Front: `frontend/src/features/requests/RequestListPage.tsx` (filtros na URL)

## Testes

| Critério | Teste |
|---|---|
| CA-04.1 | `T/WorkflowIntegrationTest#draftsAreInvisibleEvenToAdmin`; `T/domain/AccessPolicyTest#draftsAreVisibleToTheOwnerOnlyAdminIncluded` |
| CA-04.2 | `T/SecurityIntegrationTest#anApproverOfAnotherCostCenterSeesNothingAndCannotDecide`; `T/domain/AccessPolicyTest#approversSeeTheirCenterAdminSeesEverythingElse` |
| CA-04.5 | `T/SecurityIntegrationTest#searchWildcardsMatchLiterally`; `T/application/InputHardeningTest#searchWildcardsAreEscapedAndMatchLiterally` |
| CA-04.7 | `T/domain/AccessPolicyTest#allowedActionsPerCaller` |
| CA-04.3, CA-04.4, CA-04.6 | `E2E/03-request-list.cy.ts` (contra o backend simulado) · ⚠ **lacuna**: sem teste de back-end para ordenação, limite de página e filtros |
