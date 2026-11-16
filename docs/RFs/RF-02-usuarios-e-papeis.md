# RF-02 — Usuários e papéis

| Origem | IDs relacionados | Status |
|---|---|---|
| README §1.1, §2.1, §3.1 | FR-005, FR-044, FR-045, SEC-004 | ✅ implementado · ⚠ sem teste de back-end |

## Descrição

Existem três papéis: `SOLICITANTE`, `APROVADOR` (com `approverLevel` `NIVEL_1` ou `NIVEL_2`) e `ADMIN`.
Só o `ADMIN` lista, cria e edita usuários de qualquer papel e nível. **Qualquer papel pode criar solicitações.**

## Regras

- **RN-02.1** `GET /users`, `POST /users` e `PATCH /users/:id` são exclusivos de `ADMIN`.
- **RN-02.2** `APROVADOR` exige `approverLevel` e centro de custo; `SOLICITANTE` exige centro de custo;
  `ADMIN` é global (sem centro e sem nível).
- **RN-02.3** `PATCH /users/:id` altera nome, papel, nível ou centro de custo e exige o `lockVersion` atual do usuário.
- **RN-02.4** A mudança de papel vale na requisição seguinte do usuário afetado (o usuário corrente é sempre
  recarregado do banco, não lido só do token).
- **RN-02.5** E-mail único sem diferenciar maiúsculas e minúsculas (garantido no banco).
- **RN-02.6** Centros de custo: `GET /cost-centers` é público (usado no cadastro); `POST /cost-centers` é só `ADMIN`,
  com `code` único.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-02.1 | um `SOLICITANTE` ou `APROVADOR` | chama `GET /users` ou `POST /users` | recebe `403 FORBIDDEN` |
| CA-02.2 | um `ADMIN` | cria um `APROVADOR` sem `approverLevel` | recebe `400` com erro no campo |
| CA-02.3 | um `ADMIN` | promove um usuário a `APROVADOR NIVEL_1` | a próxima requisição desse usuário já tem o novo papel |
| CA-02.4 | um e-mail existente em outra caixa (`A@x` × `a@x`) | o `ADMIN` tenta criar | recebe `409 EMAIL_ALREADY_REGISTERED` |
| CA-02.5 | um `ADMIN` | cria um centro de custo com código repetido | recebe `409 CODE_ALREADY_USED` |
| CA-02.6 | um `PATCH` com `lockVersion` desatualizado | é enviado | recebe `409 CONCURRENCY_CONFLICT` |

## Códigos HTTP

`200`/`201` sucesso · `400 VALIDATION_FAILED` · `403 FORBIDDEN` (papel) · `404 NOT_FOUND` ·
`409 EMAIL_ALREADY_REGISTERED` / `CODE_ALREADY_USED` / `CONCURRENCY_CONFLICT`.

## Implementação

- `B/api/AdminController.java` (`/users`, `/cost-centers`)
- `B/application/UserAdminService.java`, `B/application/UserMapping.java`, `B/application/CostCenterService.java`
- `B/domain/Role.java`, `B/domain/ApproverLevel.java`
- Front (diferencial): `frontend/src/features/admin/AdminPage.tsx`

## Testes

| Critério | Teste |
|---|---|
| CA-02.4 | `T/SecurityIntegrationTest#emailUniquenessIsCaseInsensitiveInTheDatabase` (no banco) |
| CA-02.1, CA-02.2, CA-02.5 | `E2E/07-admin.cy.ts` (contra o backend simulado) |
| CA-02.3, CA-02.6 | ⚠ **lacuna**: nenhum teste de back-end para `UserAdminService`/`PATCH /users` |
