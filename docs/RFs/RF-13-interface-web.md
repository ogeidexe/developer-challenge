# RF-13 — Interface web (front-end)

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.7 | FR-031…FR-040 | ✅ implementado · E2E contra o backend simulado e contra a API real |

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
- **RN-13.11 Tabelas antd:** filtros e ordenação nos cabeçalhos das colunas. Na listagem de solicitações eles vão
  para o servidor e para a URL (status, categoria, centro, busca no título, faixa de total, período); nas demais
  tabelas (caixa, orçamentos do dashboard, administração, itens) são feitos no cliente sobre a lista completa.
- **RN-13.12 Formulários antd:** todo campo tem regra de validação do antd que espelha o back-end (nome completo,
  senha, e-mail, datas futuras, valores maiores que zero, centro obrigatório fora do ADMIN); o back-end continua
  sendo a fonte da verdade e seus `errors[]` são mapeados para os campos.
- **RN-13.13 Logo:** `frontend/public/logo.svg` é o favicon e aparece na tela de login e na barra superior.
- **RN-13.14 HTTP sem TLS:** a SPA funciona servida em `http://` por um host que não é `localhost` (contexto não
  seguro, onde o navegador não oferece `crypto.randomUUID`). O `X-Request-Id` e a `Idempotency-Key` vêm de
  `frontend/src/shared/uuid.ts`, que usa `crypto.randomUUID` quando existe e senão gera um UUID v4 com
  `crypto.getRandomValues`. Antes disso, qualquer chamada falhava no navegador com "Falha inesperada" sem chegar
  ao servidor (nem ao Network do DevTools).

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
| CA-13.8 | a SPA num site `http://` sem `crypto.randomUUID` | o usuário entra, abre "Criar conta" e cria uma solicitação | as requisições chegam ao servidor: login funciona, os centros de custo são listados e a solicitação é criada |

## Implementação

- `frontend/src/App.tsx` (rotas, guarda por papel), `frontend/src/shared/auth/AuthContext.tsx`, `frontend/src/shared/auth/safeReturnUrl.ts`
- `frontend/src/shared/api/client.ts`, `frontend/src/shared/api/errors.ts` (tratamento de `401`/`409`/`422`)
- `frontend/src/shared/uuid.ts` (UUID para `X-Request-Id` e `Idempotency-Key`, também em HTTP sem TLS)
- `frontend/src/features/*` (uma pasta por tela)
- ADR: [`ADR-013`](../adr/ADR-013-frontend-architecture.md)

## Testes (Cypress)

Duas suítes: `npm run test:e2e` (backend simulado, `E2E/`) e `npm run test:e2e:api` (API real da stack do
compose, `frontend/cypress/e2e-api/`, abreviado `E2E-API/`).

| Critério | Spec |
|---|---|
| CA-13.1, CA-13.2 | `E2E/01-login.cy.ts`, `E2E/09-security.cy.ts` |
| CA-13.3 | `E2E/03-request-list.cy.ts` |
| CA-13.4…CA-13.6 | `E2E/05-request-detail.cy.ts` |
| CA-13.7 | `E2E/04-request-form.cy.ts` (validação no cliente) · ⚠ mapeamento de `errors[]` do servidor sem caso dedicado |
| Navegação e guardas | `E2E/08-navigation.cy.ts`, `E2E/07-admin.cy.ts` |
| RN-13.11 (tabelas) | `E2E/03-request-list.cy.ts` (filtros de coluna), `E2E/06-inbox.cy.ts`, `E2E/02-dashboard.cy.ts`, `E2E/07-admin.cy.ts` (ordenação e filtros) |
| RN-13.12 (formulários) | `E2E/01-login.cy.ts`, `E2E/04-request-form.cy.ts`, `E2E/07-admin.cy.ts` |
| RN-13.13 (logo) | `E2E/01-login.cy.ts` ("shows the company logo…") |
| CA-13.8, RN-13.14 (HTTP sem TLS) | `E2E/01-login.cy.ts` e `E2E-API/01-seed-and-reads.cy.ts`, bloco "on a plain-HTTP site (no crypto.randomUUID…)" (remove `crypto.randomUUID` antes de carregar a página com `cy.visitWithoutRandomUUID`) |
| Contra a API real | `E2E-API/01-seed-and-reads.cy.ts` (sessão, dashboard, listagem, caixa, `404`), `E2E-API/02-approval-flow.cy.ts` (3 etapas, `SOFTWARE`, segregação, rejeição, `409`), `E2E-API/03-budget-and-versions.cy.ts` (`BUDGET_EXCEEDED`, v2) |

⚠ **Limitação:** telas de administração e alguns casos de borda só são testados contra o backend simulado.
