/*
 * Roteiro de testes manuais do desafio pleno — parte 1: requisitos funcionais (README §2 a §4).
 * Cada teste: id estável, título, passos (o que o avaliador faz), resultado esperado e referência
 * (seção do README e critério de docs/RFs). `texto entre crases` vira código na página.
 *
 * Convenções dos passos:
 *   - App: http://localhost:8080 (gateway Nginx) · API: http://localhost:8080/api · senha do seed: Kingspan@123
 *   - Pré-requisito de todos: `docker compose down --volumes && docker compose up --build` (banco recém-criado)
 */
window.TEST_PLAN = window.TEST_PLAN || { areas: [] };

window.TEST_PLAN.areas.push(
  {
    id: 'AUTH',
    title: 'Autenticação e usuários',
    ref: 'README §2.1, §3.1 · RF-01, RF-02',
    tests: [
      {
        id: 'AUTH-01',
        title: 'Login devolve um JWT de curta duração com as claims mínimas',
        steps: [
          'Faça login: `curl -s -X POST $API/auth/login -H "Content-Type: application/json" -d \'{"email":"aprov1.ti@kingspan.test","password":"Kingspan@123"}\'`.',
          'Decodifique o `token` (ex.: jwt.io, só a parte do meio).',
        ],
        expected: '`200` com `token`, `expiresIn` ≈ 900 s; claims `sub`, `role`, `costCenterId`, `approverLevel` (NIVEL_1), `exp`, `iss`, `aud`.',
        ref: '§2.1 · RF-01 CA-01.1',
      },
      {
        id: 'AUTH-02',
        title: 'Credenciais inválidas: mesma resposta para e-mail inexistente e senha errada',
        steps: ['Tente logar com `ninguem@x.com` e depois com `solic.ti@kingspan.test` + senha errada.', 'Na tela de login, tente o mesmo.'],
        expected: 'Os dois casos dão `401` com o mesmo corpo; a tela mostra uma mensagem clara e continua em /login.',
        ref: '§2.1 · RF-01 CA-01.2',
      },
      {
        id: 'AUTH-03',
        title: '`GET /auth/me` devolve o usuário logado sem senha nem hash',
        steps: ['Com o token do AUTH-01: `curl -s $API/auth/me -H "Authorization: Bearer $TOKEN"`.'],
        expected: '`200` com id, e-mail, nome, papel, nível e centro de custo; nenhum campo `password`/hash.',
        ref: '§2.1 · RF-01 CA-01.6',
      },
      {
        id: 'AUTH-04',
        title: 'Cadastro público cria apenas SOLICITANTE, com nome completo, senha confirmada e medidor de força',
        steps: [
          'Na tela "Criar conta", abra "Centro de custo" (deve listar CC-TI-01 e CC-ADM-02).',
          'Tente os nomes `Jo`, `José`, `João-Silva Souza` e `Silva, João`; depois `José da Silva`.',
          'Digite senhas de forças diferentes e uma confirmação diferente da senha.',
          'Pela API, cadastre-se em `POST $API/auth/register` enviando também `"role":"ADMIN"` no corpo.',
        ],
        expected: 'Centros listados; nomes inválidos recusados (só `José da Silva` passa); o medidor vai de Fraca a Forte e a confirmação diferente é recusada; `201` e o usuário é `SOLICITANTE`, sem nível.',
        ref: '§2.1 · RF-01 CA-01.3',
      },
      {
        id: 'AUTH-05',
        title: 'Token expirado, adulterado ou ausente → 401',
        steps: ['Chame `GET $API/requests` sem token.', 'Altere um caractere do token e repita.'],
        expected: '`401` em `application/problem+json` com `code: UNAUTHENTICATED`.',
        ref: '§3.2 · RF-01 CA-01.5',
      },
      {
        id: 'AUTH-06',
        title: 'Logout encerra a sessão (Redis): o mesmo token deixa de valer',
        steps: ['Faça login, depois `POST $API/auth/logout` com o token.', 'Repita `GET $API/auth/me` com o mesmo token.'],
        expected: 'Logout `204`; em seguida `401`. Na tela, "Sair" no menu do usuário volta para /login.',
        ref: 'Diferencial · RF-01 CA-01.8 · ADR-015',
      },
      {
        id: 'AUTH-07',
        title: 'Só ADMIN cria e edita usuários de qualquer papel',
        steps: [
          'Com token de `solic.ti`: `GET $API/users` e `POST $API/users`.',
          'Com token de `admin1`: crie um APROVADOR NIVEL_2 e depois edite (PATCH) o papel de outro usuário.',
        ],
        expected: 'Não-admin recebe `403 FORBIDDEN`; ADMIN cria (APROVADOR sem nível → `400` no campo `approverLevel`) e edita.',
        ref: '§2.1, §3.1 · RF-02 CA-02.1, CA-02.2',
      },
      {
        id: 'AUTH-08',
        title: 'Mudança de papel vale na próxima requisição',
        steps: ['Faça login com um SOLICITANTE e guarde o token.', 'Como ADMIN, promova-o a APROVADOR (PATCH /users/:id).', 'Com o token antigo, chame `GET $API/approvals/inbox`.'],
        expected: 'Antes `403`, depois `200`: o usuário é recarregado do banco a cada requisição.',
        ref: '§2.1 · RF-02 CA-02.3',
      },
    ],
  },
  {
    id: 'REQ',
    title: 'Criação e edição de solicitações',
    ref: 'README §2.2 · RF-03',
    tests: [
      {
        id: 'REQ-01',
        title: 'Criação com itens: nasce DRAFT e o total é calculado no back-end',
        steps: [
          'Como `solic.adm`, crie pela tela "Nova solicitação" com 2 itens.',
          'Pela API, envie um item `5 × "4899.90"` e um campo `"total":"1.00"` no corpo.',
        ],
        expected: 'Status `DRAFT`; total `24499.50` (o total do cliente é ignorado); a tela mostra o total do servidor.',
        ref: '§2.2 · RF-03 CA-03.1',
      },
      {
        id: 'REQ-02',
        title: 'Validações de campos com erro por campo',
        steps: ['Envie `quantity: 0`, `unitPrice: "-1"`, `title` vazio e `neededBy` com a data de hoje.', 'Na tela, tente salvar o formulário vazio.'],
        expected: '`400 VALIDATION_FAILED` com `errors[]` (um por campo, ex.: `items[0].quantity`); a tela marca cada campo.',
        ref: '§2.2, §3.2 · RF-03 CA-03.2',
      },
      {
        id: 'REQ-03',
        title: 'Categoria aceita só o enum e centro de custo padrão é o do solicitante',
        steps: ['Crie sem `costCenterId`.', 'Crie com `"category":"FOOD"`.'],
        expected: 'Sem centro → fica no centro do solicitante; categoria fora de `EQUIPMENT|SERVICES|SUPPLIES|TRAVEL|SOFTWARE|OTHER` → `400`.',
        ref: '§2.2 · RF-03 CA-03.7',
      },
      {
        id: 'REQ-04',
        title: 'Edição só pelo dono e só em DRAFT ou CHANGES_REQUESTED',
        steps: [
          'Como dono, edite um rascunho (ok).',
          'Tente editar "Kit periféricos estoque" (PENDING_APPROVAL) como `solic.ti`.',
          'Tente editar como `aprov1.ti` (vê, mas não é dono).',
        ],
        expected: 'Rascunho editado; pendente → `422 INVALID_TRANSITION`; não-dono → `403 NOT_REQUEST_OWNER`. A tela só mostra "Editar" quando permitido.',
        ref: '§2.2 · RF-03 CA-03.3, CA-03.5',
      },
    ],
  },
  {
    id: 'LIST',
    title: 'Listagem, filtros e visibilidade',
    ref: 'README §2.2, §3.2 · RF-04',
    tests: [
      {
        id: 'LIST-01',
        title: 'Paginação e ordenação no formato do README',
        steps: ['`GET $API/requests?page=0&size=2&sort=total,desc` como `admin1`.', 'Tente `sort=password,asc` e `size=1000`.'],
        expected: '`{ data, page, size, totalElements, totalPages }` ordenado por total; campo inválido → `400 INVALID_SORT`; `size` limitado a 100.',
        ref: '§3.2 · RF-04 CA-04.3, CA-04.4',
      },
      {
        id: 'LIST-02',
        title: 'Filtros status, category, costCenterId, createdFrom, createdTo (nos cabeçalhos da tabela)',
        steps: [
          'Na listagem, use os filtros dos cabeçalhos das colunas (Status, Categoria, Centro, Título, Total, Criada em); copie a URL e abra em outra aba.',
          'Pela API, combine `status=PENDING_APPROVAL&category=SOFTWARE`.',
        ],
        expected: 'O filtro vai para a URL e sobrevive ao recarregar (link compartilhável); a API combina os filtros.',
        ref: '§2.2, §2.7 · RF-04 CA-04.6 · RF-13 CA-13.3',
      },
      {
        id: 'LIST-03',
        title: 'Visibilidade por papel',
        steps: ['Liste como `solic.ti`, `aprov1.ti` e `admin1`.'],
        expected: 'Solicitante vê só as próprias; aprovador vê as do seu centro (CC-TI-01); admin vê todas — exceto rascunhos alheios.',
        ref: '§2.2 · RF-04 RN-04.1',
      },
      {
        id: 'LIST-04',
        title: 'Rascunhos só para o dono (inclusive para o ADMIN)',
        steps: ['Como `admin1`, procure "Monitores para o time de suporte" (rascunho do `solic.ti`).', 'Tente abrir pelo id (pegue o id logado como `solic.ti`).'],
        expected: 'Não aparece na lista do admin; abrir pelo id → `404` (página "não encontrada").',
        ref: '§2.2 · RF-04 CA-04.1 · ADR-012',
      },
      {
        id: 'LIST-05',
        title: 'Recurso fora da visibilidade → 404 (decisão do ADR)',
        steps: ['Como `aprov1.ti` (CC-TI-01), abra "Notebooks para o time de TI" (CC-ADM-02) pelo id.'],
        expected: '`404 NOT_FOUND`, sem revelar que existe; o ADR-012 justifica 404 × 403.',
        ref: '§3.2 · RF-04 CA-04.2',
      },
    ],
  },
  {
    id: 'CHAIN',
    title: 'Montagem da cadeia de aprovação',
    ref: 'README §2.3 · RF-05',
    tests: [
      {
        id: 'CHAIN-01',
        title: 'Cadeia por valor nos limites exatos',
        steps: ['Crie e submeta três solicitações: R$ 1.000,00, R$ 1.000,01 e R$ 10.000,01 (categoria EQUIPMENT).'],
        expected: '`[NIVEL_1]`, `[NIVEL_1, NIVEL_2]` e `[NIVEL_1, NIVEL_2, ADMIN]`, visíveis no detalhe.',
        ref: '§2.3 · RF-05 CA-05.1–CA-05.4',
      },
      {
        id: 'CHAIN-02',
        title: 'SOFTWARE sempre termina com ADMIN, sem duplicar',
        steps: ['Submeta SOFTWARE de R$ 300,00 e de R$ 50.000,00.'],
        expected: '`[NIVEL_1, ADMIN]` e `[NIVEL_1, NIVEL_2, ADMIN]` (um único ADMIN).',
        ref: '§2.3 regra 1 · RF-05 CA-05.5, CA-05.7',
      },
    ],
  },
  {
    id: 'FLOW',
    title: 'Transições e máquina de estados',
    ref: 'README §4 · RF-06',
    tests: [
      {
        id: 'FLOW-01',
        title: 'Fluxo completo de 3 etapas até APPROVED (roteiro do vídeo)',
        steps: [
          'Como `solic.adm`, crie uma solicitação > R$ 10.000 e submeta.',
          'Aprove como `aprov1.adm` (N1), `aprov2.adm` (N2) e `admin1` (ADMIN).',
        ],
        expected: 'Cada etapa avança em ordem; ao final `APPROVED` e o orçamento de CC-ADM-02 é consumido no dashboard.',
        ref: '§2.3, §4.2, §8.1 · RF-06 CA-06.7',
      },
      {
        id: 'FLOW-02',
        title: 'Quem pode aprovar cada etapa',
        steps: ['Numa solicitação na etapa N2, tente aprovar como um APROVADOR NIVEL_1 do centro.', 'Tente aprovar como SOLICITANTE pela API.'],
        expected: 'N1 na etapa N2 → `422 APPROVER_NOT_ELIGIBLE` explicando quem pode; SOLICITANTE → `403 FORBIDDEN`.',
        ref: '§2.3 regra 2 · RF-06 CA-06.3, CA-06.4',
      },
      {
        id: 'FLOW-03',
        title: 'Comentário obrigatório (≥ 10 caracteres) ao rejeitar e devolver',
        steps: ['Rejeite com o comentário "curto" e depois com um comentário válido.'],
        expected: 'Curto → `422 COMMENT_REQUIRED` (a tela bloqueia no modal); válido → `REJECTED` e as etapas seguintes encerradas.',
        ref: '§2.3 regra 4 · RF-06 CA-06.5, CA-06.8',
      },
      {
        id: 'FLOW-04',
        title: 'Cancelamento pelo dono ou ADMIN; estados finais bloqueados',
        steps: ['Cancele um rascunho seu e uma solicitação pendente como ADMIN.', 'Tente qualquer ação numa solicitação APPROVED/REJECTED/CANCELLED.'],
        expected: 'Cancelamentos ok; em estado final → `422 INVALID_TRANSITION` e o orçamento nunca é consumido duas vezes.',
        ref: '§4.2 · RF-06 CA-06.1, CA-06.2',
      },
      {
        id: 'FLOW-05',
        title: 'Ordem de verificação 401 → 404 → 403 → 409 → 422',
        steps: ['Combine erros na mesma chamada: sem token; id invisível; papel errado; lockVersion antigo; regra violada.'],
        expected: 'O status segue a ordem do README §4.3; mensagens `422` explicam o motivo (não "ação inválida").',
        ref: '§4.3 · RF-06 RN-06.4, RN-06.5',
      },
      {
        id: 'FLOW-06',
        title: 'Etapa sem aprovador elegível fica pendente (não é erro)',
        steps: ['Como `admin1`, crie (em um centro) uma solicitação > R$ 10.000 e leve-a até a etapa ADMIN.', 'Abra a caixa de `admin1` e de `admin2`.'],
        expected: 'Continua pendente; só aparece para `admin2`; `admin1` não consegue aprovar a própria.',
        ref: '§2.3 regra 7 · RF-06 RN-06.6',
      },
    ],
  },
  {
    id: 'SOD',
    title: 'Segregação de funções',
    ref: 'README §2.3 regra 3 · RF-07',
    tests: [
      {
        id: 'SOD-01',
        title: 'Ninguém aprova a própria solicitação',
        steps: ['Como `aprov1.ti`, crie e submeta uma solicitação no próprio centro e tente aprová-la.'],
        expected: '`422 SELF_APPROVAL_FORBIDDEN`; a tela não oferece "Aprovar" ao dono.',
        ref: '§2.3 · RF-07 CA-07.1',
      },
      {
        id: 'SOD-02',
        title: 'A mesma pessoa não aprova duas etapas da mesma versão',
        steps: ['Numa cadeia [N1, N2], aprove a etapa N1 como `aprov2.ti` (NIVEL_2 pode aprovar N1).', 'Tente aprovar a etapa N2 com o mesmo usuário.'],
        expected: '`422 DUPLICATE_APPROVER` citando a etapa NIVEL_1; a solicitação some da caixa dele.',
        ref: '§2.3 · RF-07 CA-07.3, CA-07.5',
      },
    ],
  },
  {
    id: 'BUDGET',
    title: 'Orçamento',
    ref: 'README §2.3 regra 5, §3.1 · RF-08',
    tests: [
      {
        id: 'BUDGET-01',
        title: 'BUDGET_EXCEEDED mantém a solicitação pendente e registra a tentativa',
        steps: ['Como `aprov1.ti`, aprove "Kit periféricos estoque" (R$ 900; CC-TI-01 tem R$ 800 livres).'],
        expected: '`422 BUDGET_EXCEEDED` com saldo e valor na mensagem; continua `PENDING_APPROVAL`; o histórico mostra a tentativa.',
        ref: '§2.3 · RF-08 CA-08.2',
      },
      {
        id: 'BUDGET-02',
        title: 'Consumo só na última etapa, no mês de competência',
        steps: ['No FLOW-01, confira o consumido antes e depois de cada etapa.'],
        expected: 'Só a aprovação final consome; o mês é o da submissão da versão atual (fuso America/Sao_Paulo).',
        ref: '§2.3 · RF-08 CA-08.1, CA-08.4',
      },
      {
        id: 'BUDGET-03',
        title: 'Mês sem orçamento = saldo zero',
        steps: ['Como ADMIN, consulte `GET $API/cost-centers/<id>/budgets/1999-01`.'],
        expected: 'Valores `0.00`; uma aprovação final nesse mês daria `BUDGET_EXCEEDED`.',
        ref: '§2.3 · RF-08 CA-08.3',
      },
      {
        id: 'BUDGET-04',
        title: 'PUT de orçamento: só ADMIN e nunca abaixo do consumido',
        steps: ['Como `admin1`, defina o orçamento de CC-TI-01 do mês para `40000.00` (consumido: 49.200).', 'Tente como `solic.ti`.'],
        expected: '`422 BUDGET_BELOW_CONSUMED`; não-admin → `403`; mês inválido (`2026-13`) → `400`.',
        ref: '§3.1 · RF-08 CA-08.5',
      },
    ],
  },
  {
    id: 'VER',
    title: 'Versões',
    ref: 'README §2.3 regra 6 · RF-09',
    tests: [
      {
        id: 'VER-01',
        title: 'Devolver → editar → reenviar cria v2 e preserva a v1',
        steps: ['Como `solic.ti`, abra "Antivírus corporativo" (devolvida) e clique "Reenviar (v2)".', 'Alterne entre v1 e v2 no detalhe; consulte `GET $API/requests/<id>/versions/1`.'],
        expected: 'v2 em aprovação com cadeia nova; v1 imutável (40 licenças) e consultável.',
        ref: '§2.3 · RF-09 CA-09.1, CA-09.2',
      },
      {
        id: 'VER-02',
        title: 'A cadeia é recalculada do zero e aprovações antigas não contam',
        steps: ['Devolva uma solicitação de R$ 5.000 aprovada em N1, reduza para R$ 500 e reenvie.'],
        expected: 'A v2 tem só `[NIVEL_1]`, toda pendente; quem aprovou na v1 pode aprovar de novo.',
        ref: '§2.3 · RF-09 CA-09.3, CA-09.5',
      },
      {
        id: 'VER-03',
        title: 'lockVersion ≠ versão',
        steps: ['Observe `lockVersion` e `currentVersion` no detalhe antes e depois de cada ação.'],
        expected: '`lockVersion` muda a cada alteração; a versão (v1, v2…) só muda no reenvio.',
        ref: '§3.2 · RF-09',
      },
    ],
  },
  {
    id: 'INBOX',
    title: 'Caixa de aprovação',
    ref: 'README §2.4 · RF-10',
    tests: [
      {
        id: 'INBOX-01',
        title: 'Lista só o que o usuário pode aprovar agora',
        steps: ['Abra a caixa como `aprov1.ti` e como `aprov2.ti`.'],
        expected: '`aprov1.ti`: só "Kit periféricos estoque" (N1); `aprov2.ti`: também "Switch rede predial" (N2) e etapas N1 do centro.',
        ref: '§2.4 · RF-10 CA-10.1, CA-10.2',
      },
      {
        id: 'INBOX-02',
        title: 'Aplica centro de custo e segregação; SOLICITANTE não tem caixa',
        steps: ['Confira que `aprov1.ti` não vê nada de CC-ADM-02.', 'Como `solic.ti`, procure o menu e acesse /approvals.'],
        expected: 'Nada de outro centro; SOLICITANTE sem menu e com página 403.',
        ref: '§2.4 · RF-10 CA-10.3, RN-10.7',
      },
    ],
  },
  {
    id: 'HIST',
    title: 'Histórico e auditoria',
    ref: 'README §2.5 · RF-11',
    tests: [
      {
        id: 'HIST-01',
        title: 'Cada ação gera evento com todos os campos',
        steps: ['Após o FLOW-01, `GET $API/requests/<id>/history`; veja também a linha do tempo no detalhe.'],
        expected: 'Eventos em ordem com ator, papel, ação, status de/para, etapa, versão, comentário, data UTC e `xRequestId`.',
        ref: '§2.5 · RF-11 CA-11.1, CA-11.5',
      },
      {
        id: 'HIST-02',
        title: 'O X-Request-Id da requisição fica no evento',
        steps: ['Envie uma ação com `-H "X-Request-Id: teste-avaliador-1"` e leia o histórico.'],
        expected: 'O evento daquela ação tem `xRequestId: "teste-avaliador-1"`; a resposta devolve o mesmo cabeçalho.',
        ref: '§2.5, §5.1 · RF-11 CA-11.3',
      },
      {
        id: 'HIST-03',
        title: 'Append-only garantido pelo banco',
        steps: ['Num cliente SQL (`docker compose exec db psql -U purchase purchase`), tente `UPDATE request_events SET comment = \'x\';`.'],
        expected: 'O banco recusa (trigger); eventos e versões nunca são alterados nem apagados.',
        ref: '§2.5, §6 · RF-11 CA-11.4',
      },
    ],
  },
  {
    id: 'DASH',
    title: 'Dashboard',
    ref: 'README §2.6 · RF-12',
    tests: [
      {
        id: 'DASH-01',
        title: 'Totais por status no escopo do papel',
        steps: ['Abra o dashboard como `admin1`, `aprov1.ti` e `solic.ti`.'],
        expected: 'Admin: tudo menos rascunhos alheios; aprovador: seu centro; solicitante: as próprias (com o seu rascunho).',
        ref: '§2.6 · RF-12 CA-12.1–CA-12.3',
      },
      {
        id: 'DASH-02',
        title: 'Orçamento do mês: orçado, consumido e disponível',
        steps: ['Como `admin1`, confira CC-TI-01 e CC-ADM-02.'],
        expected: 'CC-TI-01: 50.000,00 / 49.200,00 / 800,00; após uma aprovação final, o consumido aumenta.',
        ref: '§2.6 · RF-12 CA-12.4, CA-12.5',
      },
    ],
  },
);
