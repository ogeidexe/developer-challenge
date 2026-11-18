Quais ferramentas e modelos você usou e para quê (ex.: scaffolding, testes, revisão, documentação)

- Para o início deste projeto, gostaria muito de ter utilizado TDD. Porém, devido ao curto período de tempo disponível para o desenho e a concepção do projeto, acabei recorrendo ao bom e velho MVC.

- Entretanto, para garantir que as regras fossem seguidas rigorosamente, meu primeiro passo foi estruturar o banco de dados, os RFs, RNFs e diagramas UML, para visualizar melhor o problema a ser resolvido.

- Após a leitura e conferência desses documentos, criei as SPECS, textos que orientam a implementação da IA dentro do projeto, evitando que ela perca de vista os objetivos e a arquitetura definidos.

- Após a leitura das SPECS, foram gerados os códigos de front-end(Mock). De uma forma da qual não me orgulho muito, os testes foram realizados logo em seguida. O efeito colateral positivo dessa configuração de desenvolvimento foi a própria documentação do projeto.

- Conferido o comportamento do MOCK foi gerado o back end, tabem com testes cobrindo as partes mais sensiveis do projeto.

Onde a IA errou ou sugeriu algo ruim e como você percebeu e corrigiu (dê pelo menos 2 exemplos concretos)

- Principalmente nos requisitos de segurança, validação de campos e segurança de senhas, pois a IA não estabelece critérios para aspectos que não são discutidos explicitamente com ela.

- Primeiro exemplo — Campo de senha: inicialmente, foi criado um campo de senha sem confirmação, tamanho mínimo ou requisitos de caracteres especiais. Tive de solicitar uma revisão dos campos e a implementação dos critérios mínimos esperados para cada um.

- Segundo exemplo — Filtros de tabelas: a IA não incluiu filtros e opções de ordenação em todas as tabelas, mesmo que o projeto os exigisse.

- Terceiro exemplo — Uso excessivo de boilerplate: houve uso exaustivo de código boilerplate, com trechos não funcionais e sem a aplicação de frameworks ou boas práticas de redução e reutilização de código. Esses aspectos tiveram de ser corrigidos e reforçados manualmente.


Que partes você escreveu sem IA, de propósito, e por quê?

 - Este documento, porque o desafio pede. XD


Como você validou o código gerado?
- Documentação e prompts: sempre relendo a documentação gerada e confrontando-a com o que já havia sido implementado.
- Testes automáticos: testes unitários (front-end e back-end) e testes E2E (front-end).
- Testes assistidos: em /driven-tests, escrevi um roteiro de testes para que pudessem ser acompanhados e executados manualmente, a fim de verificar situações diretas e indiretas que poderiam afetar a qualidade da entrega.