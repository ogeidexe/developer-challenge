# RNF-03 — Idempotência

| Origem | IDs relacionados | Status |
|---|---|---|
| README §3.1, §3.2 | NFR-022, DATA-007, FR-024 (diferencial, não feito) | ✅ atendido e testado (só `POST /requests`) |

## Requisito

`POST /requests` com o mesmo `Idempotency-Key`, do mesmo usuário e com o mesmo payload, devolve **a mesma
resposta** sem criar outra solicitação. Validade mínima: 24 h.

## Regras verificáveis

- **RN-R03.1** Sem o cabeçalho → criação normal, sem deduplicação.
- **RN-R03.2** A chave vale **por usuário**: a mesma chave usada por outro usuário é independente.
- **RN-R03.3** Mesma chave + mesmo payload → **replay** do status e do corpo gravados (`201`, mesmo `id`).
- **RN-R03.4** Mesma chave + payload diferente → `409 IDEMPOTENCY_PAYLOAD_MISMATCH`.
- **RN-R03.5** Payload comparado por hash SHA-256 de uma forma canônica (ordem fixa de campos, textos aparados,
  preços em centavos): `"10"` e `"10.00"` são o mesmo payload.
- **RN-R03.6** Validade de 24 h (`app.idempotency.ttl`); um job apaga as chaves expiradas a cada hora.
  Chave expirada conta como inexistente.
- **RN-R03.7** Duas requisições simultâneas com a mesma chave: a chave é reservada **antes** de criar
  (`INSERT … ON CONFLICT`), então só uma cria e a outra faz replay ou recebe `409`.
- **RN-R03.8** A solicitação e o registro da chave são gravados na mesma transação.
- **RN-R03.9** Idempotência nas **ações de transição** é um diferencial **não implementado**; elas são protegidas pelo `lockVersion`.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-R03.1 | `Idempotency-Key: K` e um payload P | `POST /requests` duas vezes | as duas respostas são idênticas e existe uma só solicitação |
| CA-R03.2 | a chave K já usada com P | `POST` com K e outro payload | `409 IDEMPOTENCY_PAYLOAD_MISMATCH` |
| CA-R03.3 | K usada pelo usuário A | o usuário B usa K | cria uma solicitação nova para B |
| CA-R03.4 | `unitPrice: "10"` e depois `"10.00"` com a mesma K | segundo `POST` | replay (mesmo payload) |

## Implementação

- `B/application/IdempotencyService.java`, `B/application/IdempotencyPurgeJob.java`
- `B/api/RequestController.java` (cabeçalho `Idempotency-Key`)
- `backend/src/main/resources/db/migration/V6__idempotency.sql`
- ADR: [010](../adr/ADR-010-idempotency-strategy.md)

## Testes

| Critério | Teste |
|---|---|
| CA-R03.1, CA-R03.2 | `T/WorkflowIntegrationTest#idempotentCreateReplaysTheStoredResponse` |
| CA-R03.3 | `T/RequestRulesIntegrationTest#anIdempotencyKeyBelongsToOneUser` |
| CA-R03.4 | `T/RequestRulesIntegrationTest#equivalentPayloadsReplayInsteadOfConflicting` |
| RN-R03.7 | ⚠ **lacuna**: sem teste de corrida com a mesma chave |
