# RF-13 — Interface web (front-end)

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.7 | FR-031…FR-040 | ✅ implementado · ⚠ E2E só contra o backend simulado |

## Descrição

SPA em React que conduz cada papel pelo fluxo **sem duplicar as regras do back-end**: as ações vêm de
`allowedActions`, e o total exibido é só ilustrativo.

## Regras

- **RN-13.1 Sessão:** login; rotas protegidas por papel; `401` em qualquer chamada → login, e depois volta à
  rota de origem. O `returnUrl` só aceita caminhos internos (proteção contra open redirect, SEC-F02).
- **RN-13.2 Dashboard** conforme [RF-12](RF-12-dashboard.md).
- **RN-13.3 Listagem** com filtros, ordenação e paginação **no servidor**, refletidos na URL (link compartilhável
  que sobrevive a recarregar a página).
- **RN-13.4 Caixa de aprovação** conforme [RF-10](RF-10-caixa-de-aprovacao.md).
- **RN-13.5 Formulário** de criação e edição com itens dinâmicos (adicionar/remover), total em tempo real **só para
  exibição**, e erros de validação do servidor (`errors[]`) mapeados para cada campo.
- **RN-13.6 Detalhe:** dados, versões (v1, v2… consultáveis), cadeia de aprovação (etapa, quem aprovou e quando)
  e linha do tempo do histórico.
- **RN-13.7 Ações guiadas pela API:** os botões vêm **só** de `allowedActions`; o front não reimplementa permissões.
- **RN-13.8** Modal de comentário obrigatório (≥ 10 caracteres) para rejeitar e devolver.
- **RN-13.9 Mensagens:** `409` → "alguém agiu antes de você", e a tela recarrega; `422` → a mensagem do servidor,
  que explica o motivo; estados de carregando, vazio e erro.
- **RN-13.10** Telas de administração são diferencial (não obrigatórias) e existem para `ADMIN`.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-13.1 | um visitante anônimo em `/requests?status=PENDING_APPROVAL` | faz login | volta para a mesma URL, com o filtro |
| CA-13.2 | uma sessão expirada | qualquer chamada devolve `401` | vai ao login e depois volta para onde estava |
| CA-13.3 | um filtro aplicado | a página é recarregada ou a URL é compartilhada | o mesmo filtro está aplicado |
| CA-13.4 | o detalhe aberto por pessoas diferentes | é renderizado | cada uma vê só os botões do seu `allowedActions` |
| CA-13.5 | duas abas na mesma solicitação | a segunda aprova depois da primeira | mensagem de `409` e a tela recarrega |
| CA-13.6 | um `422 BUDGET_EXCEEDED` | a aprovação falha | a mensagem do servidor (saldo e valor) é exibida e o status não muda |
| CA-13.7 | um `400` com `errors[]` | o formulário é salvo | cada erro aparece no seu campo |

## Implementação

- `frontend/src/App.tsx` (rotas, guarda por papel), `frontend/src/shared/auth/AuthContext.tsx`, `frontend/src/shared/auth/safeReturnUrl.ts`
- `frontend/src/shared/api/client.ts`, `frontend/src/shared/api/errors.ts` (tratamento de `401`/`409`/`422`)
- `frontend/src/features/*` (uma pasta por tela)
- ADR: [`ADR-013`](../adr/ADR-013-frontend-architecture.md)

## Testes (Cypress, `npm run test:e2e`)

| Critério | Spec |
|---|---|
| CA-13.1, CA-13.2 | `E2E/01-login.cy.ts`, `E2E/09-security.cy.ts` |
| CA-13.3 | `E2E/03-request-list.cy.ts` |
| CA-13.4…CA-13.6 | `E2E/05-request-detail.cy.ts` |
| CA-13.7 | `E2E/04-request-form.cy.ts` (validação no cliente) · ⚠ mapeamento de `errors[]` do servidor sem caso dedicado |
| Navegação e guardas | `E2E/08-navigation.cy.ts`, `E2E/07-admin.cy.ts` |

⚠ **Limitação:** as specs rodam contra o backend simulado em memória (`frontend/src/shared/api/mock/`), não contra
a API real. O smoke test do `docker compose` no CI cobre só login e chamadas básicas pela API real.
