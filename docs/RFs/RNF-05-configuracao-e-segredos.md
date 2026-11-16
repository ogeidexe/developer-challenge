# RNF-05 — Configuração e segredos

| Origem | IDs relacionados | Status |
|---|---|---|
| README §5.1, §5.3 | NFR-008, NFR-010, SEC-007, INF-003 | ✅ atendido |

## Requisito

Toda configuração vem de variáveis de ambiente; nenhum segredo é commitado; `.env.example` lista todas as variáveis.

## Regras verificáveis

- **RN-R05.1** Todo valor de `application.yml` pode ser sobrescrito por variável de ambiente.
- **RN-R05.2** `JWT_SECRET` não tem valor padrão: o back-end **não sobe** sem ele, com menos de 32 bytes ou com
  um placeholder documentado (ex.: `change-me`).
- **RN-R05.3** `.env.example` lista todas as variáveis (back-end, front-end e portas do compose), sem valores secretos reais.
- **RN-R05.4** No `docker compose`, sem `JWT_SECRET` no `.env`, um segredo aleatório é gerado na primeira subida e
  guardado num volume, sem passo manual e sem segredo no repositório.
- **RN-R05.5** O CI procura segredos em **todo o histórico** do git (gitleaks); qualquer achado bloqueia o build.
  Falsos positivos ficam documentados em `.gitleaks.toml`, por valor exato.
- **RN-R05.6** A senha pública do seed só é aceitável em demonstração local; `SEED_ENABLED=false` desliga o seed.

## Critérios de aceite

| # | Dado | Quando | Então |
|---|---|---|---|
| CA-R05.1 | `JWT_SECRET` vazio, curto ou `change-me` | o back-end sobe | falha na inicialização com mensagem clara |
| CA-R05.2 | um clone limpo | `docker compose up --build` sem `.env` | sobe, com segredo gerado |
| CA-R05.3 | o histórico do repositório | o job `secrets` roda | nenhum achado |

## Implementação

- `backend/src/main/resources/application.yml`, `B/config/AppProperties.java` (validação)
- `B/security/SecurityConfig.java` (`jwtSigningKey`: recusa segredo fraco)
- `.env.example`, `docker-compose.yml` (serviço `jwt-secret`), `.gitleaks.toml`, `.github/workflows/security.yml`
- Auditoria: [`docs/security/SECRETS-AUDIT.md`](../security/SECRETS-AUDIT.md)

## Testes

| Critério | Teste |
|---|---|
| CA-R05.1 | `T/security/JwtValidationTest#refusesToStartWithAShortSecret`, `#refusesToStartWithTheDocumentedPlaceholderSecret` |
| CA-R05.2 | job `compose` em `.github/workflows/ci.yml` |
| CA-R05.3 | job `secrets` em `.github/workflows/security.yml` |
