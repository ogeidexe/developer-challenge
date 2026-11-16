// Real API, read-only checks against the backend seed (DemoSeed). Runs first, on a fresh database.
import { USERS } from '../support/commands'

const stat = (title: string) => cy.contains('.ant-statistic', title).find('.ant-statistic-content-value')
const budgetRow = (code: string) => cy.contains('.ant-table-row', code)
const rows = () => cy.get('.ant-table-tbody .ant-table-row')

describe('Real API — session, dashboard, list and inbox on the seed', () => {
  it('rejects wrong credentials with the backend message and stays on /login', () => {
    cy.visit('/login')
    cy.get('#login_email').type(USERS.solicTi)
    cy.get('#login_password').type('senhaErrada1')
    cy.contains('button', /^Entrar$/).click()
    cy.get('.ant-alert-error').should('be.visible')
    cy.location('pathname').should('eq', '/login')
  })

  it('sends an anonymous visitor to /login and back to the original route with its filter', () => {
    cy.visit('/requests?status=APPROVED')
    cy.location('pathname').should('eq', '/login')
    cy.get('#login_email').type(USERS.admin1)
    cy.get('#login_password').type('Kingspan@123', { log: false })
    cy.contains('button', /^Entrar$/).click()
    cy.location('pathname').should('eq', '/requests')
    cy.location('search').should('eq', '?status=APPROVED')
    rows().should('have.length', 2) // seed: "Servidor virtualização" and "Climatização sala de reunião"
  })

  it('ADMIN dashboard: totals by status (no drafts) and current-month budgets from the backend', () => {
    cy.login(USERS.admin1)
    stat('Rascunho').should('have.text', '0') // drafts are owner-only, ADMIN included (ADR-012)
    stat('Em aprovação').should('have.text', '4')
    stat('Devolvida p/ ajuste').should('have.text', '1')
    stat('Aprovada').should('have.text', '2')
    stat('Rejeitada').should('have.text', '1')
    stat('Cancelada').should('have.text', '1')
    budgetRow('CC-TI-01').should('contain', '50.000,00').and('contain', '49.200,00').and('contain', '800,00')
    budgetRow('CC-ADM-02').should('contain', '80.000,00').and('contain', '12.000,00').and('contain', '68.000,00')
  })

  it('SOLICITANTE dashboard: own requests and own cost center only', () => {
    cy.login(USERS.solicTi)
    stat('Rascunho').should('have.text', '1') // "Monitores para o time de suporte", visible to its owner
    budgetRow('CC-TI-01').should('exist')
    cy.contains('.ant-table-row', 'CC-ADM-02').should('not.exist')
  })

  it('list: server-side status filter in the URL, and search by title', () => {
    cy.login(USERS.admin1)
    cy.visit('/requests?status=PENDING_APPROVAL')
    rows()
      .should('have.length', 4)
      .each((row) => cy.wrap(row).should('contain', 'Em aprovação'))
    cy.visit('/requests?q=Notebooks')
    rows().should('have.length', 1).first().should('contain', 'Notebooks para o time de TI')
  })

  it('inbox: each approver sees only what they can approve now', () => {
    cy.login(USERS.aprov1Ti)
    cy.visit('/approvals')
    rows().should('have.length', 1).first().should('contain', 'Kit periféricos estoque')

    cy.login(USERS.aprov2Ti) // NIVEL_2 also gets the NIVEL_1 steps of the own center
    cy.visit('/approvals')
    rows().should('have.length', 2)
    cy.contains('.ant-table-row', 'Kit periféricos estoque')
    cy.contains('.ant-table-row', 'Switch rede predial')
  })

  it('logout from the user menu ends the Redis session: the old token is rejected by the backend', () => {
    cy.login(USERS.aprov1Ti)
    cy.window().then((win) => {
      const token = JSON.parse(win.sessionStorage.getItem('kp_auth') ?? '{}').token as string
      cy.request({ url: '/api/auth/me', headers: { Authorization: `Bearer ${token}` } })
        .its('status')
        .should('eq', 200)
      cy.intercept('POST', '/api/auth/logout').as('logout')
      cy.get('.ant-layout-header').contains('button', 'João Nunes').click()
      cy.get('.ant-dropdown-menu').contains('Sair').click()
      cy.location('pathname').should('eq', '/login')
      cy.wait('@logout').its('response.statusCode').should('eq', 204)
      cy.request({ url: '/api/auth/me', headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false })
        .its('status')
        .should('eq', 401)
    })
  })

  it('a request of another cost center is invisible to an APROVADOR (404 page)', () => {
    cy.requestIdByTitle(USERS.admin1, 'Notebooks para o time de TI').then((id) => {
      cy.login(USERS.aprov1Ti)
      cy.visit(`/requests/${id}`)
      cy.contains('.ant-result', 'Solicitação não encontrada') // the backend answered 404 (ADR-012)
    })
  })
})
