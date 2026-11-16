// Support file of the real-API suite (cypress.api.config.ts). Reuses every UI command of ./commands and
// replaces `apiAs` — the "second browser" helper — with real HTTP calls through the frontend's /api proxy.
import { PASSWORD } from './commands'

Cypress.Commands.overwrite('apiAs', (_original: unknown, email: string, method: string, path: string, body?: unknown) =>
  cy
    .request({ method: 'POST', url: '/api/auth/login', body: { email, password: PASSWORD }, log: false })
    .then((login) =>
      cy.request({
        method,
        url: `/api${path}`,
        body: body as Cypress.RequestBody,
        headers: { Authorization: `Bearer ${login.body.token}` },
        failOnStatusCode: false,
      }),
    )
    .then((res) => ({ status: res.status, json: res.body })),
)
