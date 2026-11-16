# RF-01 — Autenticação e JWT

| Origem | IDs relacionados | Status |
|---|---|---|
| README §2.1, §3.1 | FR-001…FR-004, FR-041…FR-043, SEC-001, SEC-002, SEC-005, SEC-006 | ✅ implementado |

## Descrição

O sistema autentica usuários por e-mail e senha e devolve um **JWT de curta duração**. Toda rota, exceto as
públicas, exige o token no cabeçalho `Authorization: Bearer <token>`. O cadastro público cria apenas
`SOLICITANTE`.

## Regras

- **RN-01.1** `POST /auth/login` com credenciais válidas devolve `{ token, tokenType, expiresIn, user }`.
- **RN-01.2** O token expira em **15 min** (`JWT_TTL`, padrão `PT15M`) e traz as claims `sub` (id do usuário),
  `role`, `costCenterId`, `approverLevel` (quando houver), `iss`, `aud`, `iat` e `exp`.
- **RN-01.3** E-mail inexistente e senha errada devolvem **a mesma** resposta `401` (não revela quais e-mails existem).
- **RN-01.4** `POST /auth/register` cria **sempre** `SOLICITANTE` com `approverLevel = null`; papel ou nível
  enviados no corpo são ignorados.
- **RN-01.5** Senha: 8 a 72 bytes (limite do bcrypt), guardada com bcrypt; senha ou hash **nunca** aparecem
  em resposta alguma.
- **RN-01.6** `GET /auth/me` devolve o usuário logado, sempre recarregado do banco (uma mudança de papel vale
  na próxima requisição, sem esperar o token expirar).
- **RN-01.7** Rotas públicas: `POST /auth/register`, `POST /auth/login`, `GET /health`, `GET /cost-centers`,
  `/docs` e `/v3/api-docs`.
- **RN-01.8** Limite de tentativas de login: 5 falhas por conta e 50 por cliente em 15 min (configuráveis) → `429`.
- **RN-01.9** Token com assinatura, emissor ou audiência errados, expirado, sem `exp` ou com `alg: none` → `401`.
- **RN-01.10 Sessão no Redis (ADR-015):** cada login abre uma sessão `session:<jti>` com o TTL do token; o token só
  é aceito enquanto a sessão existe. `POST /auth/logout` (autenticado, `204`) encerra a sessão: o mesmo token
  recebe `401` a partir da requisição seguinte. Sem Redis, os tokens são recusados (falha fechada).
- **RN-01.11** No compose, o gateway Nginx limita `POST /api/auth/login` por IP (`GATEWAY_LOGIN_RATE`, padrão
  `30r/m`, rajada 20) → `429` (ADR-016).

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-01.1 | um usuário do seed | faz login com a senha certa | recebe `200` com token cujas claims seguem a RN-01.2 |
| CA-01.2 | um e-mail inexistente e outro existente com senha errada | tenta logar com cada um | recebe `401` idêntico nos dois casos |
| CA-01.3 | um visitante | se cadastra enviando `"role": "ADMIN"` | a conta é criada como `SOLICITANTE` |
| CA-01.4 | uma conta com 5 falhas seguidas | tenta de novo, mesmo com a senha certa | recebe `429 TOO_MANY_REQUESTS` até a janela expirar |
| CA-01.5 | um token expirado ou adulterado | chama qualquer rota protegida | recebe `401 UNAUTHENTICATED` |
| CA-01.6 | um usuário logado | chama `GET /auth/me` | recebe os próprios dados, sem `password`/`passwordHash` |
| CA-01.7 | uma senha com mais de 72 bytes | se cadastra | recebe `400`, não `500` e sem truncar a senha |
| CA-01.8 | um usuário logado | chama `POST /auth/logout` e depois `GET /auth/me` com o mesmo token | recebe `204` e depois `401 UNAUTHENTICATED`; um novo login funciona |
| CA-01.9 | dois logins do mesmo usuário | uma das sessões é encerrada | só o token daquela sessão passa a dar `401` |

## Códigos HTTP

| Situação | Status | `code` |
|---|---|---|
| Login ok / cadastro ok / logout | `200` / `201` / `204` | — |
| Corpo inválido (e-mail, tamanho da senha) | `400` | `VALIDATION_FAILED` |
| Credenciais inválidas, token ausente/inválido/expirado | `401` | `UNAUTHENTICATED` |
| E-mail já cadastrado (sem diferenciar maiúsculas) | `409` | `EMAIL_ALREADY_REGISTERED` |
| Muitas tentativas | `429` | `TOO_MANY_REQUESTS` |

## Implementação

- `B/api/AdminController.java` (rotas `/auth/*`)
- `B/application/AuthService.java`, `B/application/PasswordRules.java`
- `B/security/JwtService.java`, `B/security/SecurityConfig.java` (rotas públicas, validação do token, recusa de segredo fraco)
- `B/security/LoginAttemptLimiter.java`, `B/security/CurrentUser.java`
- `B/security/SessionStore.java` (sessões no Redis), `B/security/SecurityConfig.java#sessionAwareJwtDecoder`, `POST /auth/logout` em `B/api/AdminController.java`
- Front: `frontend/src/features/auth/LoginPage.tsx`, `frontend/src/shared/auth/AuthContext.tsx`

## Testes

| Critério | Teste |
|---|---|
| CA-01.1 | `T/SecurityIntegrationTest#issuedTokensCarryAudienceAndExpiryAndPassValidation`; `E2E/01-login.cy.ts` |
| CA-01.2 | `T/SecurityIntegrationTest#unknownEmailAndWrongPasswordFailIdentically` |
| CA-01.3 | `T/SecurityIntegrationTest#publicSignUpAlwaysCreatesASolicitante`; `E2E/01-login.cy.ts` |
| CA-01.4 | `T/SecurityIntegrationTest#repeatedWrongPasswordsLockTheAccountEvenForTheRightPassword`; `T/security/LoginAttemptLimiterTest` |
| CA-01.5 | `T/security/JwtValidationTest` (10 casos) |
| CA-01.6 | `T/HttpContractIntegrationTest#meReturnsTheCallerAndNoPasswordField` (HTTP real) |
| CA-01.7 | `T/SecurityIntegrationTest#passwordsLongerThanBcryptCanHashAreRejectedNotTruncatedOrA500`; `T/application/InputHardeningTest#passwordsAreLimitedTo72BytesNot72Characters` |
| CA-01.8 | `T/HttpContractIntegrationTest#logoutEndsTheSessionImmediately`; logout pela interface contra a API real em `frontend/cypress/e2e-api/01-seed-and-reads.cy.ts`; smoke test do compose no CI |
| CA-01.9 | `T/HttpContractIntegrationTest#eachLoginOpensARedisSessionWithTheTokenLifetime` |
