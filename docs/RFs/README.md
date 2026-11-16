# Requisitos detalhados — RF e RNF

O `README.md` da raiz (o enunciado) mistura requisitos funcionais, regras, API e entrega na mesma seção, e cada
item agrupa muitas regras. Esta pasta quebra tudo em **requisitos pequenos e testáveis**, um arquivo por tema.

> **Relação com os outros documentos.** O enunciado (`README.md` da raiz) continua sendo a fonte da verdade e
> não pode ser alterado. O catálogo [`docs/analysis/REQUIREMENTS.md`](../analysis/REQUIREMENTS.md) mantém os IDs
> estáveis (`FR-`, `BR-`, `NFR-`…), que cada arquivo daqui cita no cabeçalho. Esta pasta é a referência
> **detalhada e orientada a teste**: regras numeradas, critérios de aceite, códigos HTTP, onde está o código e
> quais testes cobrem.

## Como ler cada arquivo

1. **Cabeçalho:** seção do enunciado de origem, IDs do catálogo e status.
2. **Descrição** do requisito.
3. **Regras** numeradas (`RN-xx.n`).
4. **Critérios de aceite** em Dado / Quando / Então (`CA-xx.n`), cada um verificável por um teste.
5. **Códigos HTTP** e `code` de erro esperados.
6. **Implementação:** onde está no código.
7. **Testes:** qual teste cobre cada critério. ⚠ marca **lacunas**, critérios sem teste automatizado.

Abreviações de caminho usadas nos arquivos:

| Abreviação | Caminho |
|---|---|
| `B/` | `backend/src/main/java/com/example/purchase/` |
| `T/` | `backend/src/test/java/com/example/purchase/` |
| `E2E/` | `frontend/cypress/e2e/` |

`T/Classe#metodo` identifica um método de teste JUnit; `E2E/arquivo.cy.ts` identifica uma spec Cypress.

## Requisitos funcionais

| ID | Requisito | Enunciado | Status | Testes |
|---|---|---|---|---|
| [RF-01](RF-01-autenticacao.md) | Autenticação e JWT | §2.1 | ✅ | back-end + E2E · ⚠ `/auth/me` |
| [RF-02](RF-02-usuarios-e-papeis.md) | Usuários e papéis | §1.1, §2.1 | ✅ | ⚠ só E2E (mock) |
| [RF-03](RF-03-criacao-e-edicao.md) | Criação e edição de solicitações | §2.2 | ✅ | back-end + E2E |
| [RF-04](RF-04-listagem-e-visibilidade.md) | Listagem e visibilidade | §2.2, §3.2 | ✅ | back-end (visibilidade) · ⚠ filtros só E2E |
| [RF-05](RF-05-cadeia-de-aprovacao.md) | Montagem da cadeia de aprovação | §2.3 | ✅ | unitário + integração + E2E |
| [RF-06](RF-06-transicoes.md) | Transições (submeter, aprovar, rejeitar, devolver, cancelar) | §2.3, §4 | ✅ | unitário + integração + E2E |
| [RF-07](RF-07-segregacao-de-funcoes.md) | Segregação de funções | §2.3 | ✅ | unitário + integração + E2E |
| [RF-08](RF-08-orcamento.md) | Orçamento e `BUDGET_EXCEEDED` | §2.3 | ✅ | integração + concorrência · ⚠ `PUT` de orçamento |
| [RF-09](RF-09-versionamento.md) | Versionamento (v1, v2…) | §2.3 | ✅ | integração + E2E |
| [RF-10](RF-10-caixa-de-aprovacao.md) | Caixa de aprovação | §2.4 | ✅ | ⚠ só E2E (mock) |
| [RF-11](RF-11-historico-e-auditoria.md) | Histórico e auditoria | §2.5 | ✅ | integração · ⚠ `X-Request-Id` no evento |
| [RF-12](RF-12-dashboard.md) | Dashboard | §2.6 | ✅ | ⚠ só E2E (mock) |
| [RF-13](RF-13-interface-web.md) | Interface web | §2.7 | ✅ | E2E (mock) |

## Requisitos não funcionais

| ID | Requisito | Enunciado | Status | Testes |
|---|---|---|---|---|
| [RNF-01](RNF-01-arquitetura.md) | Arquitetura e domínio isolado | §5.1 | ✅ | testes de domínio sem Spring/banco |
| [RNF-02](RNF-02-concorrencia.md) | Concorrência e transações | §5.1, §5.2 | ✅ | concorrência com PostgreSQL real |
| [RNF-03](RNF-03-idempotencia.md) | Idempotência | §3.2 | ✅ | integração · ⚠ casos de borda |
| [RNF-04](RNF-04-logs-e-request-id.md) | Logs estruturados e `X-Request-Id` | §5.1 | ✅ | ⚠ só o smoke test do `/health` |
| [RNF-05](RNF-05-configuracao-e-segredos.md) | Configuração e segredos | §5.1, §5.3 | ✅ | unitário + CI (gitleaks, compose) |
| [RNF-06](RNF-06-testes.md) | Testes automatizados | §5.2 | ✅ | 226 testes (172 back-end, 54 E2E) |
| [RNF-07](RNF-07-execucao-e-ci.md) | Execução e CI | §5.3 | ✅ | CI: build, lint, testes, compose |
| [RNF-08](RNF-08-seed.md) | Seed obrigatório | §5.4 | ✅ | smoke test do CI |
| [RNF-09](RNF-09-documentacao.md) | Documentação | §5.5, §5.6 | ✅ · ⏳ `AI_USAGE.md` e vídeo | — |

## Lacunas de teste

A lista consolidada do que ainda não tem teste automatizado no back-end está em
[RNF-06 › Lacunas conhecidas](RNF-06-testes.md#lacunas-conhecidas-consolidadas-dos-rfrnf).

## Manutenção

Quando o código ou um teste mudar, atualize o RF/RNF correspondente **no mesmo commit**: regras, critérios e,
principalmente, a tabela de testes. Um critério novo sem teste entra com ⚠.
