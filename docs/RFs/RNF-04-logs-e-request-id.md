# RNF-04 — Logs estruturados e `X-Request-Id`

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.5, §5.1 | NFR-007, INF-005, INF-006 | ✅ atendido · ⚠ sem teste automatizado |

## Requisito

Logs estruturados em JSON com o `X-Request-Id`, que é gerado quando não vem na requisição e devolvido na resposta.
`GET /health` informa a saúde da aplicação, incluindo o banco.

## Regras verificáveis

- **RN-R04.1** Toda resposta traz o cabeçalho `X-Request-Id`.
- **RN-R04.2** Se o cliente enviar um `X-Request-Id` seguro (caracteres e tamanho limitados), ele é reaproveitado;
  senão (ausente ou inválido), um UUID novo é gerado. Isso impede injeção de texto nos logs.
- **RN-R04.3** Logs no formato JSON (ECS) no console, com o `requestId` no MDC em todas as linhas da requisição.
- **RN-R04.4** O mesmo id é gravado em cada evento do histórico ([RF-11](RF-11-historico-e-auditoria.md)) e
  devolvido no campo `requestId` dos erros `problem+json`.
- **RN-R04.5** `GET /health` é público e responde `{"status":"UP"}` com os componentes, incluindo o banco; com o
  banco fora, responde `503` com `DOWN`.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-R04.1 | uma requisição sem `X-Request-Id` | é respondida | a resposta traz um UUID novo em `X-Request-Id` |
| CA-R04.2 | `X-Request-Id: abc-123` | a requisição gera um erro | o corpo tem `requestId: "abc-123"` e o log da requisição também |
| CA-R04.3 | `X-Request-Id` com quebra de linha ou muito longo | é enviado | é descartado e um UUID novo é usado |
| CA-R04.4 | o banco no ar | `GET /health` | `200` e `"UP"` |

## Implementação

- `B/api/RequestIdFilter.java`, `B/config/RequestContext.java`
- `backend/src/main/resources/application.yml` (`logging.structured.format.console: ecs`, `management.*`)

## Testes

- CA-R04.4: o job `compose` do CI (`.github/workflows/ci.yml`) verifica `/health` = `UP` com a stack completa
- CA-R04.1…CA-R04.3: ⚠ **lacuna**: nenhum teste automatizado do `RequestIdFilter`
