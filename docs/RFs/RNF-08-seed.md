# RNF-08 — Seed obrigatório

| Origem | IDs relacionados | Status |
|---|---|---|
| README §5.4 | NFR-003 | ✅ atendido |

## Requisito

Dados fictícios criados automaticamente na primeira subida, suficientes para demonstrar todos os fluxos.

## Regras verificáveis

- **RN-R08.1** Dois centros de custo: `CC-TI-01` (orçamento do mês **quase esgotado**) e `CC-ADM-02`.
- **RN-R08.2** Por centro: 1 `SOLICITANTE`, 1 `APROVADOR NIVEL_1` e 1 `APROVADOR NIVEL_2`.
- **RN-R08.3** Dois `ADMIN` globais, para nenhum fluxo travar pela segregação (RN-06.6).
- **RN-R08.4** Solicitações em estados variados, criadas **pelos serviços reais** (histórico, versões, etapas e
  consumo de orçamento são genuínos, não inseridos direto no banco).
- **RN-R08.5** Idempotente: se os dados já existem, o seed não roda de novo.
- **RN-R08.6** Senha única e pública `Kingspan@123`, documentada no [`SOLUTION.md`](../../SOLUTION.md);
  `SEED_ENABLED=false` desliga o seed.

## Dados

| Papel | E-mail | Centro |
|---|---|---|
| ADMIN | `admin1@kingspan.test`, `admin2@kingspan.test` | — |
| APROVADOR `NIVEL_1` | `aprov1.ti@kingspan.test`, `aprov1.adm@kingspan.test` | CC-TI-01, CC-ADM-02 |
| APROVADOR `NIVEL_2` | `aprov2.ti@kingspan.test`, `aprov2.adm@kingspan.test` | CC-TI-01, CC-ADM-02 |
| SOLICITANTE | `solic.ti@kingspan.test`, `solic.adm@kingspan.test` | CC-TI-01, CC-ADM-02 |

| Orçamento do mês corrente | Orçado | Consumido | Disponível |
|---|---|---|---|
| CC-TI-01 | R$ 50.000,00 | R$ 49.200,00 ("Servidor virtualização", `APPROVED`) | R$ 800,00 |
| CC-ADM-02 | R$ 80.000,00 | depende das aprovações do seed | — |

Cenários prontos para demonstração:

| Cenário | Solicitação |
|---|---|
| `BUDGET_EXCEEDED` | "Kit periféricos estoque" (R$ 900,00, CC-TI-01, etapa `NIVEL_1`) |
| Fluxo de 3 etapas (vídeo) | "Notebooks para o time de TI" (R$ 24.499,50, CC-ADM-02, etapa `ADMIN`) |
| Devolução → v2 | "Antivírus corporativo" (`CHANGES_REQUESTED`, `solic.ti`) |
| `SOFTWARE` + `ADMIN` | solicitação `SOFTWARE` de R$ 3.000,00 em CC-ADM-02 |

## Critérios de aceite

| # | Verificação | Resultado esperado |
|---|---|---|
| CA-R08.1 | login de cada usuário da tabela após o primeiro `docker compose up` | todos entram com `Kingspan@123` |
| CA-R08.2 | dashboard do `admin1` | CC-TI-01 com R$ 800,00 disponíveis |
| CA-R08.3 | reiniciar o back-end | o seed não duplica dados |

## Implementação

- `B/config/DemoSeed.java`
- Smoke test do CI faz login com `admin1@kingspan.test` (job `compose` em `.github/workflows/ci.yml`)
