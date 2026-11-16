# RNF-09 — Documentação

| Origem | IDs relacionados | Status |
|---|---|---|
| README §3.1 (OpenAPI), §5.5, §5.6 | FR-064, SUB-* | ✅ atendido · `AI_USAGE.md` e vídeo são do candidato |

## Requisito

Documentação na raiz e nas pastas, ADRs obrigatórios e OpenAPI disponível na aplicação. O `README.md` da raiz é o
enunciado e **não pode ser alterado**.

## Entregáveis

| Item | Onde | Situação |
|---|---|---|
| `SOLUTION.md`: visão geral, como rodar (compose e local), usuários do seed, decisões e trade-offs, o que ficou de fora, próximos passos | [`SOLUTION.md`](../../SOLUTION.md) | ✅ |
| ≥ 3 ADRs, entre eles (a) concorrência, (b) versões e histórico, (c) `403` × `404` | [`docs/adr/`](../adr/): 16 ADRs, incluindo [009](../adr/ADR-009-concurrency-control.md), [011](../adr/ADR-011-versioning-history-modeling.md), [012](../adr/ADR-012-403-vs-404.md) | ✅ |
| `AI_USAGE.md` | raiz | ⏳ **escrito pelo candidato** (agentes de IA não podem escrevê-lo) |
| `backend/README.md`: pré-requisitos, variáveis, comandos, exemplos `curl` | [`backend/README.md`](../../backend/README.md) | ✅ |
| `frontend/README.md`: pré-requisitos, variáveis, comandos | [`frontend/README.md`](../../frontend/README.md) | ✅ |
| OpenAPI na aplicação | `/docs` (Swagger UI) e `/v3/api-docs`; contrato em [`docs/api/openapi.yaml`](../api/openapi.yaml) | ✅ |
| Requisitos detalhados e testáveis | esta pasta (`docs/RFs/`) | ✅ |
| Vídeo de 15 a 25 min (README §8.1) | link no e-mail de entrega | ⏳ candidato |

## Regras verificáveis

- **RN-R09.1** Arquivos protegidos (`README.md`, `AGENTS.md`, `CLAUDE.md`, `.agents/`, etc.) nunca são alterados.
- **RN-R09.2** Commits pequenos, em Conventional Commits, contando a evolução; mudanças feitas com IA ficam
  registradas em `.agents/changelog/diff.md` e os commits trazem `AI-Assisted: yes`.
- **RN-R09.3** Os documentos de `docs/` citam o código e os testes reais; quando o código muda, o RF/RNF
  correspondente é atualizado no mesmo commit.

## Critérios de aceite

| # | Verificação | Resultado esperado |
|---|---|---|
| CA-R09.1 | abrir `http://localhost:3000/docs` com a stack no ar | Swagger UI com todos os endpoints de README §3.1 |
| CA-R09.2 | seguir o `SOLUTION.md` num clone limpo | o sistema sobe e os usuários do seed entram |
| CA-R09.3 | `git diff` dos arquivos protegidos contra o commit original | vazio |
