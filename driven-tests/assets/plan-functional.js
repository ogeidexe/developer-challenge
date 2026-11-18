/*
 * Roteiro de testes do desafio pleno — parte 1: uso da aplicação, tela a tela (README §2 a §4).
 *
 * Cada teste: id estável (sessões salvas, relatório e tags do Cypress dependem dele), título, tela, usuário,
 * passos (o que o avaliador faz na tela), resultado esperado e referência. `texto entre crases` vira código.
 *
 * O roteiro funciona num banco NOVO ou JÁ USADO: tudo que muda dados usa solicitações criadas pelo próprio
 * roteiro, com o título começando por "Roteiro" e um sufixo seu (ex.: a data, "Roteiro 1711 – Notebooks");
 * as solicitações do seed só são consultadas. As áreas estão na ordem em que a aplicação é usada.
 *
 * Usuários do seed (senha Kingspan@123): admin1 / admin2 (ADMIN) · solic.ti (Sofia Lima) · aprov1.ti (João Nunes,
 * Nível 1) · aprov2.ti (Maria Souza, Nível 2) — centro CC-TI-01 · solic.adm (Carlos Reis) · aprov1.adm (Ana Costa,
 * Nível 1) · aprov2.adm (Pedro Alves, Nível 2) — centro CC-ADM-02. E-mails: <usuário>@kingspan.test.
 */
window.TEST_PLAN = window.TEST_PLAN || { areas: [] };

window.TEST_PLAN.areas.push(
  {
    id: 'AUTH',
    title: '1. Acesso, sessão e usuários',
    ref: 'README §2.1, §3.1 · RF-01, RF-02',
    intro:
      'Trocar de usuário: menu do usuário (canto superior direito) → "Sair", e entrar com outro. Para ver dois usuários ao mesmo tempo, use uma janela anônima. Passos marcados como Console: na aba logada, abra o DevTools (F12) → Console e cole uma vez `const api = (m, p, b, h = {}) => fetch("/api" + p, { method: m, headers: { "Content-Type": "application/json", Authorization: "Bearer " + JSON.parse(sessionStorage.kp_auth).token, ...h }, body: b && JSON.stringify(b) }).then(async (r) => [r.status, r.headers.get("content-type"), await r.json().catch(() => null)])`; depois chame, por exemplo, `await api("GET", "/auth/me")`.',
    tests: [
      {
        id: 'AUTH-01',
        title: 'Login entra no dashboard com uma sessão curta',
        screen: 'Login → Dashboard',
        user: 'aprov1.ti',
        steps: [
          'Abra a aplicação: sem sessão, ela vai para /login.',
          'Entre com `aprov1.ti@kingspan.test` / `Kingspan@123`.',
          'Console: `JSON.parse(atob(JSON.parse(sessionStorage.kp_auth).token.split(".")[1]))` (as claims do token).',
        ],
        expected:
          'Abre o dashboard com "Olá, João Nunes"; o menu mostra Dashboard, Solicitações e Caixa de aprovação. Claims `sub`, `role` APROVADOR, `costCenterId`, `approverLevel` NIVEL_1, `iss`, `aud` e `exp` ≈ 15 min depois de `iat`.',
        ref: '§2.1 · RF-01 CA-01.1',
      },
      {
        id: 'AUTH-02',
        title: 'Credenciais inválidas: a mesma mensagem para e-mail inexistente e senha errada',
        screen: 'Login',
        user: 'nenhum',
        steps: ['Tente entrar com `ninguem@x.com` / `Senha1234`.', 'Tente `solic.ti@kingspan.test` com uma senha errada.'],
        expected: 'As duas tentativas mostram a mesma mensagem de credenciais inválidas e a tela continua em /login.',
        ref: '§2.1 · RF-01 CA-01.2',
      },
      {
        id: 'AUTH-03',
        title: 'Os dados do usuário logado nunca trazem senha nem hash',
        screen: 'Console',
        user: 'solic.ti',
        steps: ['Entre como `solic.ti`.', 'Console: `await api("GET", "/auth/me")`.', 'No menu do usuário, confira o e-mail exibido.'],
        expected:
          '`200` com id, e-mail, nome, papel SOLICITANTE e centro de custo; nenhum campo de senha ou hash. O menu mostra `solic.ti@kingspan.test`.',
        ref: '§2.1 · RF-01 CA-01.6',
      },
      {
        id: 'AUTH-04',
        title: 'Cadastro público cria só SOLICITANTE, com nome completo, senha confirmada e medidor de força',
        screen: 'Login → "Criar conta"',
        user: 'nenhum',
        steps: [
          'Em "Criar conta", abra "Centro de custo": devem aparecer os centros cadastrados (CC-TI-01, CC-ADM-02…).',
          'Teste os nomes `Jo`, `José`, `João-Silva Souza` e `Silva, João`; depois `José da Silva`.',
          'Digite senhas de forças diferentes; depois uma confirmação diferente da senha.',
          'Cadastre-se com um e-mail novo (ex.: `roteiro.<sufixo>@kingspan.test`), senha `Roteiro123`.',
        ],
        expected:
          'Só `José da Silva` é aceito; o medidor vai de Fraca a Forte e a confirmação diferente é recusada. Depois do cadastro entra logado como Solicitante: menu sem Caixa de aprovação e sem Administração.',
        ref: '§2.1 · RF-01 CA-01.3',
      },
      {
        id: 'AUTH-05',
        title: 'Sessão inválida volta para o login',
        screen: 'Qualquer tela → Login',
        user: 'solic.ti',
        steps: [
          'Logado, abra o DevTools → Application → Session Storage e altere um caractere do `token` em `kp_auth`.',
          'Clique em "Solicitações" (ou recarregue a página).',
          'Console (depois de entrar de novo): `await fetch("/api/requests").then((r) => [r.status, r.headers.get("content-type")])`.',
        ],
        expected:
          'A aplicação vai para /login e, ao entrar, volta para a tela onde estava. Sem token, a API responde `401` em `application/problem+json`.',
        ref: '§3.2 · RF-01 CA-01.5',
      },
      {
        id: 'AUTH-06',
        title: '"Sair" encerra a sessão no servidor',
        screen: 'Menu do usuário',
        user: 'solic.ti',
        steps: [
          'Logado, Console: `t = JSON.parse(sessionStorage.kp_auth).token` (guarda o token).',
          'Menu do usuário → "Sair".',
          'Na tela de login, Console: `await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + t } }).then((r) => r.status)`.',
        ],
        expected: '"Sair" volta para /login; o token antigo passa a dar `401` (a sessão foi apagada no Redis).',
        ref: 'Diferencial · RF-01 CA-01.8 · ADR-015',
      },
      {
        id: 'AUTH-07',
        title: 'Só ADMIN cria e edita usuários',
        screen: 'Administração → Usuários',
        user: 'admin1, depois solic.ti',
        steps: [
          'Como `admin1`, em Administração → Usuários → "Novo usuário": crie um Aprovador sem escolher o nível e tente salvar.',
          'Escolha Nível 2 e salve (`roteiro.n2.<sufixo>@kingspan.test`, nome "Roteiro Aprovador", centro CC-TI-01).',
          'Edite o usuário criado no AUTH-04 (papel continua Solicitante; só confira que o formulário abre preenchido).',
          'Saia e entre como `solic.ti`; tente abrir `/admin` pela barra de endereço.',
        ],
        expected:
          'Sem nível o formulário avisa que o nível é obrigatório; com nível salva e o usuário aparece na tabela. Para `solic.ti` não há menu Administração e /admin mostra a página 403.',
        ref: '§2.1, §3.1 · RF-02 CA-02.1, CA-02.2',
      },
      {
        id: 'AUTH-08',
        title: 'Mudança de papel vale na próxima requisição, sem novo login',
        screen: 'Administração + janela anônima',
        user: 'admin1 e o usuário do AUTH-04',
        steps: [
          'Na janela anônima, entre com o usuário criado no AUTH-04 e abra "Solicitações" (só as dele: provavelmente nenhuma).',
          'Na janela normal, como `admin1`, edite esse usuário: papel Aprovador, Nível 1, centro CC-TI-01.',
          'Volte à janela anônima e recarregue "Solicitações" (F5), sem sair.',
        ],
        expected:
          'Depois da promoção a lista passa a mostrar as solicitações não-rascunho de CC-TI-01: o servidor relê o usuário a cada requisição. O menu (Caixa de aprovação) só muda no próximo login, porque o papel exibido vem do login.',
        ref: '§2.1 · RF-02 CA-02.3',
      },
    ],
  },
  {
    id: 'DASH',
    title: '2. Dashboard',
    ref: 'README §2.6 · RF-12',
    intro:
      'Anote os valores do orçamento agora: eles servem de base para o FLOW-01 e o BUDGET-02. Num banco novo os números são os do seed; num banco já usado, confira a coerência entre telas.',
    tests: [
      {
        id: 'DASH-01',
        title: 'Totais por status no escopo de cada papel, sem resto do usuário anterior',
        screen: 'Dashboard',
        user: 'solic.ti, aprov1.ti, admin1',
        steps: [
          'Entre como `solic.ti` e anote os totais por status.',
          'Pelo menu "Sair" (sem recarregar a página), entre como `aprov1.ti`; depois como `admin1`.',
          'Para cada usuário, compare o total com a lista em "Solicitações" (mesma visibilidade).',
        ],
        expected:
          'Solicitante: só as próprias, com o próprio rascunho; aprovador: as do seu centro, sem rascunhos alheios; admin: todas, sem rascunhos alheios. Ao trocar de usuário, os números do anterior nunca aparecem, nem por um instante. Banco novo: admin vê 0 rascunhos, 4 em aprovação, 1 devolvida, 2 aprovadas, 1 rejeitada, 1 cancelada.',
        ref: '§2.6 · RF-12 CA-12.1–CA-12.3',
      },
      {
        id: 'DASH-02',
        title: 'Orçamento do mês corrente: orçado, consumido e disponível',
        screen: 'Dashboard',
        user: 'admin1, solic.ti',
        steps: ['Como `admin1`, veja a tabela de orçamento do mês.', 'Como `solic.ti`, veja a mesma tabela.'],
        expected:
          'Admin vê todos os centros; o solicitante só o próprio (CC-TI-01). Disponível = orçado − consumido. Banco novo: CC-TI-01 50.000,00 / 49.200,00 / 800,00; CC-ADM-02 80.000,00 / 12.000,00 / 68.000,00. Também aparece o tempo médio de aprovação dos últimos 30 dias.',
        ref: '§2.6 · RF-12 CA-12.4, CA-12.5',
      },
    ],
  },
  {
    id: 'LIST',
    title: '3. Lista de solicitações e visibilidade',
    ref: 'README §2.2, §3.2 · RF-04',
    tests: [
      {
        id: 'LIST-01',
        title: 'Paginação e ordenação no servidor',
        screen: 'Solicitações',
        user: 'admin1',
        steps: [
          'Clique no cabeçalho "Total" (crescente, depois decrescente) e passe de página.',
          'Console: `await api("GET", "/requests?page=0&size=2&sort=total,desc")`, `await api("GET", "/requests?sort=password,asc")` e `await api("GET", "/requests?size=1000")`.',
        ],
        expected:
          'A ordem e a página vão para a URL e vêm do servidor. API: `{ data, page, size, totalElements, totalPages }` ordenado por total; `sort=password` → `400 INVALID_SORT`; `size=1000` volta com `size: 100`.',
        ref: '§3.2 · RF-04 CA-04.3, CA-04.4',
      },
      {
        id: 'LIST-02',
        title: 'Filtros nos cabeçalhos da tabela, refletidos na URL',
        screen: 'Solicitações',
        user: 'admin1',
        steps: [
          'Use os filtros dos cabeçalhos: Status = Em aprovação; Categoria; Centro = CC-TI-01; Criada em (um intervalo).',
          'Copie a URL, abra numa nova aba e recarregue.',
          'Filtre por um intervalo sem nenhuma solicitação (ex.: janeiro de 2000).',
        ],
        expected:
          'Cada filtro vai para a URL, a lista é filtrada pelo servidor e o link compartilhado abre igual. Sem resultado: estado vazio "Nenhuma solicitação encontrada com esses filtros" com "Limpar filtros".',
        ref: '§2.2, §2.7 · RF-04 CA-04.6 · RF-13 CA-13.3',
      },
      {
        id: 'LIST-03',
        title: 'Visibilidade por papel',
        screen: 'Solicitações',
        user: 'solic.ti, aprov1.ti, admin1',
        steps: ['Abra a lista com cada usuário e observe as colunas Solicitante e Centro.'],
        expected:
          'Solicitante vê só as próprias; aprovador vê as do seu centro (CC-TI-01) e nunca rascunhos alheios; admin vê todas, menos rascunhos alheios.',
        ref: '§2.2 · RF-04 RN-04.1',
      },
      {
        id: 'LIST-04',
        title: 'Rascunho só para o dono, inclusive para o ADMIN',
        screen: 'Solicitações → Detalhe',
        user: 'solic.ti, depois admin1',
        steps: [
          'Como `solic.ti`, abra o rascunho "Monitores para o time de suporte" e copie a URL do detalhe.',
          'Saia pelo menu e entre como `admin1` (sem recarregar a página); procure "Monitores" na lista.',
          'Cole a URL copiada.',
        ],
        expected:
          'O rascunho não aparece para o admin, nem por um instante logo depois da troca de usuário; a URL abre "Solicitação não encontrada" (404, ADR-012).',
        ref: '§2.2 · RF-04 CA-04.1 · ADR-012',
      },
      {
        id: 'LIST-05',
        title: 'Solicitação de outro centro: 404, sem revelar que existe',
        screen: 'Detalhe',
        user: 'solic.adm, depois aprov1.ti',
        steps: [
          'Como `solic.adm`, abra "Notebooks para o time de TI" (CC-ADM-02) e copie a URL.',
          'Como `aprov1.ti` (CC-TI-01), cole a URL.',
        ],
        expected: '"Solicitação não encontrada" — a mesma tela de um id inexistente (404, ADR-012).',
        ref: '§3.2 · RF-04 CA-04.2',
      },
    ],
  },
  {
    id: 'REQ',
    title: '4. Nova solicitação e edição',
    ref: 'README §2.2 · RF-03',
    intro:
      'Aqui nascem as solicitações do roteiro. R1 (REQ-01) e R2 (REQ-04) são usadas nas próximas áreas: guarde os nomes.',
    tests: [
      {
        id: 'REQ-01',
        title: 'R1: criação com itens; nasce Rascunho e o total vem do servidor',
        screen: 'Solicitações → "Nova solicitação"',
        user: 'solic.adm',
        steps: [
          'Crie R1 "Roteiro <sufixo> – Notebooks", categoria Equipamento.',
          'Itens: "Notebook" 5 × 4.899,90 e "Mouse" 2 × 50,00 (veja o total mudar enquanto digita).',
          'Clique "Criar rascunho".',
        ],
        expected:
          'O formulário mostra R$ 24.599,50 ao vivo; o detalhe abre com status Rascunho, centro CC-ADM-02 e o total R$ 24.599,50 calculado pelo servidor.',
        ref: '§2.2 · RF-03 CA-03.1',
      },
      {
        id: 'REQ-02',
        title: 'Validações por campo',
        screen: 'Nova solicitação',
        user: 'solic.adm',
        steps: [
          'Abra "Nova solicitação" e clique em "Criar rascunho" com o formulário vazio.',
          'Digite um título de 2 letras, quantidade 0, preço 0 e escolha a data de hoje em "Necessário até".',
          'Console: `await api("POST", "/requests", { title: "", category: "OTHER", items: [{ description: "x", quantity: 0, unitPrice: "-1" }] })`.',
        ],
        expected:
          'Cada campo mostra sua mensagem antes de chamar a API (o preço 0 vira 0,01; a data precisa ser futura). API: `400 VALIDATION_FAILED` com `errors[]` por campo (`title`, `items[0].quantity`, `items[0].unitPrice`).',
        ref: '§2.2, §3.2 · RF-03 CA-03.2',
      },
      {
        id: 'REQ-03',
        title: 'Centro de custo padrão e categorias fixas',
        screen: 'Nova solicitação',
        user: 'solic.ti',
        steps: [
          'Abra "Nova solicitação" e veja o campo "Centro de custo"; abra "Categoria".',
          'Console: `await api("POST", "/requests", { title: "Categoria inválida", category: "FOOD", items: [{ description: "x", quantity: 1, unitPrice: "10.00" }] })`.',
        ],
        expected:
          'O centro já vem como CC-TI-01 (o do solicitante); as categorias são só Equipamento, Serviço, Suprimentos, Viagem, Software e Outro. API: categoria fora da lista → `400`.',
        ref: '§2.2 · RF-03 CA-03.7',
      },
      {
        id: 'REQ-04',
        title: 'Editar só o dono, e só em Rascunho ou Devolvida',
        screen: 'Detalhe → "Editar"',
        user: 'solic.adm, solic.ti, aprov1.ti',
        steps: [
          'Como `solic.adm`, abra R1, clique "Editar", mude o Mouse para 3 unidades e "Salvar alterações".',
          'Como `solic.ti`, crie R2 "Roteiro <sufixo> – Kit teclados" (Suprimentos, 1 × 900,00) e clique "Submeter".',
          'Ainda em R2, procure o botão "Editar". Depois abra R2 como `aprov1.ti`.',
        ],
        expected:
          'R1 salvo com total R$ 24.649,50. R2 fica Em aprovação e o "Editar" some para o dono; o aprovador também não tem "Editar" (vê, mas não é dono). Os botões vêm da API (FE-04).',
        ref: '§2.2 · RF-03 CA-03.3, CA-03.5',
      },
    ],
  },
  {
    id: 'CHAIN',
    title: '5. Submissão e cadeia de aprovação',
    ref: 'README §2.3 · RF-05',
    intro: 'As solicitações desta área só servem para ver a cadeia: cancele cada uma no fim ("Cancelar" → "Cancelar solicitação").',
    tests: [
      {
        id: 'CHAIN-01',
        title: 'Cadeia por valor nos limites exatos',
        screen: 'Nova solicitação → Detalhe',
        user: 'solic.ti',
        steps: [
          'Crie e submeta três solicitações Equipamento: "Roteiro <sufixo> – Limite A" 1.000,00; "… B" 1.000,01; "… C" 10.000,01.',
          'Em cada detalhe, veja a "Cadeia de aprovação". Depois cancele as três.',
        ],
        expected: 'A: Nível 1. B: Nível 1 → Nível 2. C: Nível 1 → Nível 2 → Admin. Depois do cancelamento as três ficam Cancelada.',
        ref: '§2.3 · RF-05 CA-05.1–CA-05.4',
      },
      {
        id: 'CHAIN-02',
        title: 'Software sempre termina com Admin, sem repetir',
        screen: 'Nova solicitação → Detalhe',
        user: 'solic.ti',
        steps: ['Crie e submeta Software de 300,00 e de 50.000,00 ("Roteiro <sufixo> – Licenças P/G").', 'Veja as cadeias e cancele as duas.'],
        expected: '300,00: Nível 1 → Admin. 50.000,00: Nível 1 → Nível 2 → Admin (um único Admin).',
        ref: '§2.3 regra 1 · RF-05 CA-05.5, CA-05.7',
      },
    ],
  },
  {
    id: 'INBOX',
    title: '6. Caixa de aprovação',
    ref: 'README §2.4 · RF-10',
    tests: [
      {
        id: 'INBOX-01',
        title: 'R3: a caixa lista só o que cada aprovador pode decidir agora',
        screen: 'Caixa de aprovação',
        user: 'solic.ti, aprov1.ti, aprov2.ti',
        steps: [
          'Como `solic.ti`, crie e submeta R3 "Roteiro <sufixo> – Switch 24 portas" (Equipamento, 1 × 5.000,00).',
          'Abra a Caixa de aprovação como `aprov1.ti` e como `aprov2.ti`; use o filtro de centro e a ordenação por total.',
        ],
        expected:
          'Os dois veem R2 e R3 (etapa Nível 1 de CC-TI-01; o Nível 2 também pode aprovar Nível 1); nada de CC-ADM-02. "Analisar" abre o detalhe.',
        ref: '§2.4 · RF-10 CA-10.1, CA-10.2',
      },
      {
        id: 'INBOX-02',
        title: 'Centro de custo e segregação aplicados; SOLICITANTE não tem caixa',
        screen: 'Caixa de aprovação',
        user: 'aprov1.ti, solic.ti',
        steps: ['Como `aprov1.ti`, confira que nenhuma linha é de CC-ADM-02.', 'Como `solic.ti`, procure o menu da caixa e abra `/approvals` pela barra de endereço.'],
        expected: 'Só itens do próprio centro; o solicitante não tem o menu e /approvals mostra a página 403.',
        ref: '§2.4 · RF-10 CA-10.3, RN-10.7',
      },
    ],
  },
  {
    id: 'FLOW',
    title: '7. Aprovação, rejeição e cancelamento',
    ref: 'README §4 · RF-06',
    tests: [
      {
        id: 'FLOW-01',
        title: 'R1: fluxo completo de 3 etapas até Aprovada (roteiro do vídeo)',
        screen: 'Detalhe + Dashboard',
        user: 'solic.adm, aprov1.adm, aprov2.adm, admin1',
        steps: [
          'Como `solic.adm`, abra R1 e clique "Submeter".',
          'Como `aprov1.adm`, abra R1 pela caixa e "Aprovar" (comentário opcional); depois `aprov2.adm`; por último `admin1`.',
          'Depois de cada aprovação, olhe a cadeia e, como `admin1`, o orçamento de CC-ADM-02 no dashboard.',
        ],
        expected:
          'Cada etapa fica Aprovada com quem aprovou e quando; ao final o status é Aprovada e o consumido de CC-ADM-02 sobe R$ 24.649,50 só depois da etapa Admin (BUDGET-02).',
        ref: '§2.3, §4.2, §8.1 · RF-06 CA-06.7',
      },
      {
        id: 'FLOW-02',
        title: 'R3: quem pode aprovar cada etapa',
        screen: 'Detalhe',
        user: 'aprov1.ti, solic.ti',
        steps: [
          'Como `aprov1.ti`, aprove a etapa Nível 1 de R3.',
          'Ainda como `aprov1.ti`, recarregue R3 (agora na etapa Nível 2) e procure os botões de decisão.',
          'Console (como `aprov1.ti`): `await api("GET", "/requests/<id-de-R3>")` e confira `allowedActions`; como `solic.ti`: `await api("POST", "/requests/<id-de-R3>/approve", { lockVersion: 1 })`.',
        ],
        expected:
          'Na etapa Nível 2 o Nível 1 não tem Aprovar/Rejeitar/Devolver (`allowedActions` sem APPROVE) e R3 sai da caixa dele. O solicitante recebe `403 FORBIDDEN`.',
        ref: '§2.3 regra 2 · RF-06 CA-06.3, CA-06.4',
      },
      {
        id: 'FLOW-03',
        title: 'Rejeitar exige comentário de 10+ caracteres e encerra a cadeia',
        screen: 'Detalhe → modal de decisão',
        user: 'solic.adm, aprov1.adm',
        steps: [
          'Como `solic.adm`, crie e submeta "Roteiro <sufixo> – Cadeiras" (Equipamento, 1 × 3.000,00).',
          'Como `aprov1.adm`, clique "Rejeitar" e tente confirmar com "curto".',
          'Escreva "Fora do orçamento deste trimestre." e confirme.',
        ],
        expected:
          'O modal não envia com menos de 10 caracteres ("Mínimo de 10 caracteres"); com o comentário válido o status vira Rejeitada, a etapa Nível 1 fica Rejeitada e a Nível 2 "Não alcançada"; o comentário aparece na linha do tempo.',
        ref: '§2.3 regra 4 · RF-06 CA-06.5, CA-06.8',
      },
      {
        id: 'FLOW-04',
        title: 'Cancelar pelo dono ou pelo ADMIN; estados finais sem ações',
        screen: 'Detalhe + Dashboard',
        user: 'solic.ti, admin1',
        steps: [
          'Como `solic.ti`, crie o rascunho "Roteiro <sufixo> – Descartável" e cancele-o.',
          'Como `solic.adm`, crie e submeta "Roteiro <sufixo> – Cancelar pelo admin" (Outro, 1 × 300,00); como `admin1` (não é o dono), cancele-a.',
          'Abra R1 (Aprovada), "Roteiro – Cadeiras" (Rejeitada) e a cancelada pelo admin; anote o consumido de CC-ADM-02 antes e depois.',
        ],
        expected:
          'Os dois cancelamentos funcionam (o pendente fecha a etapa atual). Nas solicitações finais não há nenhum botão de ação, e o consumido não muda.',
        ref: '§4.2 · RF-06 CA-06.1, CA-06.2',
      },
      {
        id: 'FLOW-05',
        title: 'Ordem das verificações: 401 → 404 → 403 → 409 → 422',
        screen: 'Console',
        user: 'aprov1.ti, solic.adm, aprov1.adm',
        steps: [
          'Como `solic.adm`, crie e submeta "Roteiro <sufixo> – Ordem" (Outro, 1 × 500,00); pegue o id e o lockVersion no detalhe (rodapé "lockVersion N").',
          'Sem sessão: `await fetch("/api/requests/<id>/reject", { method: "POST" }).then((r) => r.status)`.',
          'Como `aprov1.ti` (outro centro): `await api("POST", "/requests/<id>/reject", { lockVersion: 1 })`. Como `solic.adm` (papel errado): o mesmo. Como `aprov1.adm`: o mesmo com o lockVersion antigo, depois com o atual.',
        ],
        expected:
          '`401`; `404` (invisível vence papel, versão e comentário); `403`; `409 CONCURRENCY_CONFLICT` com `currentLockVersion`; com o lockVersion certo `422 COMMENT_REQUIRED`, com uma mensagem que explica o motivo.',
        ref: '§4.3 · RF-06 RN-06.4, RN-06.5',
      },
      {
        id: 'FLOW-06',
        title: 'Etapa sem aprovador elegível fica pendente (não é erro)',
        screen: 'Detalhe + Caixa de aprovação',
        user: 'admin1, aprov1.adm, aprov2.adm, admin2',
        steps: [
          'Como `admin1`, crie e submeta "Roteiro <sufixo> – Climatizador" (Equipamento, centro CC-ADM-02, 1 × 15.000,00).',
          'Aprove como `aprov1.adm` (Nível 1) e `aprov2.adm` (Nível 2).',
          'Abra a caixa de `admin1` e de `admin2`; abra o detalhe como `admin1`. No fim, cancele-a como `admin1`.',
        ],
        expected:
          'Fica Em aprovação na etapa Admin; aparece só na caixa de `admin2`; `admin1` (o dono) não tem o botão Aprovar. Nada de erro na tela.',
        ref: '§2.3 regra 7 · RF-06 RN-06.6',
      },
    ],
  },
  {
    id: 'SOD',
    title: '8. Segregação de funções',
    ref: 'README §2.3 regra 3 · RF-07',
    tests: [
      {
        id: 'SOD-01',
        title: 'Ninguém aprova a própria solicitação',
        screen: 'Detalhe + Caixa de aprovação',
        user: 'aprov1.ti',
        steps: [
          'Como `aprov1.ti`, crie e submeta "Roteiro <sufixo> – Própria" (Outro, 1 × 200,00).',
          'Abra o detalhe e a sua caixa. Console: `await api("POST", "/requests/<id>/approve", { lockVersion: <lockVersion> })`. Depois cancele-a.',
        ],
        expected: 'Sem botão Aprovar para o dono e fora da caixa dele; a API responde `422 SELF_APPROVAL_FORBIDDEN`.',
        ref: '§2.3 · RF-07 CA-07.1',
      },
      {
        id: 'SOD-02',
        title: 'A mesma pessoa não aprova duas etapas da mesma versão',
        screen: 'Detalhe + Caixa de aprovação',
        user: 'solic.ti, aprov2.ti',
        steps: [
          'Como `solic.ti`, crie e submeta "Roteiro <sufixo> – Rack" (Equipamento, 1 × 3.000,00).',
          'Como `aprov2.ti` (Nível 2), aprove a etapa Nível 1.',
          'Recarregue: procure Aprovar na etapa Nível 2 e veja a caixa. Console: `await api("POST", "/requests/<id>/approve", { lockVersion: <lockVersion> })`. Depois, como `solic.ti`, cancele o Rack.',
        ],
        expected: 'Sem botões para `aprov2.ti` na etapa Nível 2 e a solicitação some da caixa dele; a API responde `422 DUPLICATE_APPROVER` citando a etapa NIVEL_1.',
        ref: '§2.3 · RF-07 CA-07.3, CA-07.5',
      },
    ],
  },
  {
    id: 'BUDGET',
    title: '9. Orçamento',
    ref: 'README §2.3 regra 5, §3.1 · RF-08',
    tests: [
      {
        id: 'BUDGET-01',
        title: 'R2: saldo insuficiente mantém a solicitação pendente e registra a tentativa',
        screen: 'Detalhe',
        user: 'aprov1.ti',
        steps: [
          'Como `aprov1.ti`, abra R2 (R$ 900,00; CC-TI-01 tem no máximo R$ 800,00 livres) e clique "Aprovar".',
          'Veja a mensagem, o status e a linha do tempo.',
        ],
        expected:
          'Mensagem do servidor com o saldo disponível e o valor exigido; R2 continua Em aprovação; a linha do tempo mostra a tentativa de aprovação sem orçamento.',
        ref: '§2.3 · RF-08 CA-08.2',
      },
      {
        id: 'BUDGET-02',
        title: 'Consumo só na última etapa, no mês de competência',
        screen: 'Dashboard + Detalhe',
        user: 'admin1',
        steps: ['No FLOW-01, compare o consumido de CC-ADM-02 antes e depois de cada etapa.', 'No detalhe de R1, veja "Competência".'],
        expected: 'N1 e N2 não mudam o consumido; só a etapa Admin consome. A competência é o mês da submissão (fuso America/Sao_Paulo).',
        ref: '§2.3 · RF-08 CA-08.1, CA-08.4',
      },
      {
        id: 'BUDGET-03',
        title: 'Mês sem orçamento = saldo zero',
        screen: 'Administração → Centros de custo / Orçamentos',
        user: 'admin1, solic.adm',
        steps: [
          'Como `admin1`, em Centros de custo → "Novo centro", crie `RT-<sufixo>` ("Roteiro").',
          'Em Orçamentos, escolha `RT-<sufixo>` e o mês corrente; depois escolha também um mês antigo de CC-TI-01.',
          'Como `solic.adm`, crie e submeta "Roteiro <sufixo> – Sem orçamento" (Outro, centro `RT-<sufixo>`, 1 × 100,00); como `admin1`, clique "Aprovar".',
        ],
        expected:
          'Mês sem orçamento mostra Orçado, Consumido e Disponível R$ 0,00; a aprovação final é recusada por orçamento insuficiente e continua Em aprovação.',
        ref: '§2.3 · RF-08 CA-08.3',
      },
      {
        id: 'BUDGET-04',
        title: 'Definir orçamento: só ADMIN e nunca abaixo do consumido',
        screen: 'Administração → Orçamentos',
        user: 'admin1, solic.ti',
        steps: [
          'Como `admin1`, em Orçamentos escolha CC-TI-01, mês corrente, digite 40.000,00 e clique "Definir".',
          'Defina 1.500,00 para `RT-<sufixo>` no mês corrente (usado no NFR-02).',
          'Como `solic.ti`, procure Administração no menu e abra `/admin`.',
        ],
        expected:
          'CC-TI-01: recusado porque fica abaixo do consumido (49.200,00 num banco novo), com a mensagem do servidor; `RT-<sufixo>` aceita 1.500,00. Solicitante: sem menu e página 403. O mês é escolhido num seletor, então um mês inválido não chega à API.',
        ref: '§3.1 · RF-08 CA-08.5',
      },
    ],
  },
  {
    id: 'VER',
    title: '10. Devolução e versões',
    ref: 'README §2.3 regra 6 · RF-09',
    tests: [
      {
        id: 'VER-01',
        title: 'R3: devolver → editar → reenviar cria v2 e preserva a v1',
        screen: 'Detalhe → "Editar" → "Reenviar"',
        user: 'admin1, solic.ti',
        steps: [
          'Com R3 na etapa Nível 2 (FLOW-02), como `admin1` clique "Devolver p/ ajuste" com um comentário de 10+ caracteres.',
          'Como `solic.ti`, abra R3, "Editar", mude para 1 × 500,00, "Salvar alterações" e "Reenviar (v2)".',
          'No detalhe, alterne entre v1 e v2.',
        ],
        expected:
          'R3 fica Devolvida p/ ajuste e depois Em aprovação como v2. A v1 continua consultável e imutável: 5.000,00, Nível 1 Aprovada, Nível 2 Devolvida com o comentário.',
        ref: '§2.3 · RF-09 CA-09.1, CA-09.2',
      },
      {
        id: 'VER-02',
        title: 'R3: a cadeia é recalculada do zero e as aprovações antigas não contam',
        screen: 'Detalhe',
        user: 'aprov1.ti',
        steps: ['Veja a cadeia da v2 de R3.', 'Como `aprov1.ti` (que aprovou a v1), aprove a v2.'],
        expected: 'A v2 tem só Nível 1, pendente; `aprov1.ti` pode aprovar de novo e R3 fica Aprovada (consome R$ 500,00 de CC-TI-01).',
        ref: '§2.3 · RF-09 CA-09.3, CA-09.5',
      },
      {
        id: 'VER-03',
        title: 'lockVersion não é a versão',
        screen: 'Detalhe (rodapé e título)',
        user: 'qualquer',
        steps: ['Durante o VER-01 e o VER-02, observe o "lockVersion N" no rodapé do detalhe e o "v1/v2" no título.'],
        expected: 'O lockVersion muda a cada alteração (editar, submeter, decidir); a versão só muda no reenvio.',
        ref: '§3.2 · RF-09',
      },
    ],
  },
  {
    id: 'HIST',
    title: '11. Histórico e auditoria',
    ref: 'README §2.5 · RF-11',
    tests: [
      {
        id: 'HIST-01',
        title: 'Cada ação gera um evento completo',
        screen: 'Detalhe → linha do tempo + DevTools',
        user: 'admin1',
        steps: ['Abra R1 e leia a linha do tempo.', 'No DevTools → Network, abra a resposta de `/history`.'],
        expected:
          'Eventos em ordem (Criada, Editada, Submetida, três Aprovadas) com quem, papel, ação, status de/para, etapa, versão, comentário e data. A resposta traz também `xRequestId` e a data em UTC (`…Z`).',
        ref: '§2.5 · RF-11 CA-11.1, CA-11.5',
      },
      {
        id: 'HIST-02',
        title: 'O X-Request-Id da ação fica no evento',
        screen: 'DevTools → Network',
        user: 'aprov1.adm',
        steps: [
          'Com o Network aberto, aprove alguma solicitação pendente de CC-ADM-02 (ex.: crie e submeta "Roteiro <sufixo> – Correlação", 1 × 100,00).',
          'Na requisição `approve`, copie o cabeçalho `X-Request-Id` enviado e o da resposta; depois abra a resposta de `/history`.',
        ],
        expected: 'A resposta devolve o mesmo `X-Request-Id`, e o evento APPROVED tem esse valor em `xRequestId`.',
        ref: '§2.5, §5.1 · RF-11 CA-11.3',
      },
      {
        id: 'HIST-03',
        title: 'Append-only garantido pelo banco',
        screen: 'Terminal (fora da aplicação)',
        user: 'avaliador',
        steps: ['`docker compose exec db psql -U purchase purchase -c "UPDATE request_events SET comment = \'x\';"`.'],
        expected: 'O banco recusa (trigger): eventos e versões nunca são alterados nem apagados.',
        ref: '§2.5, §6 · RF-11 CA-11.4',
      },
    ],
  },
);
