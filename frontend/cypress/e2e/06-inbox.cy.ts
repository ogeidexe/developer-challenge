import { USERS } from '../support/commands'

const rows = () => cy.get('.ant-table-tbody .ant-table-row')

describe('Approval inbox screen', () => {
  it('[INBOX-01] APROVADOR N1 sees only what they can approve now (level + cost center)', () => {
    cy.login(USERS.aprov1Ti)
    cy.get('.ant-menu').contains('Caixa de aprovação').click()
    cy.location('pathname').should('eq', '/approvals')
    rows().should('have.length', 1).first().should('contain', 'Kit periféricos estoque').and('contain', 'Nível 1')
  })

  it('[INBOX-01] APROVADOR N2 also gets N1 steps of the own center', () => {
    cy.login(USERS.aprov2Ti)
    cy.visit('/approvals')
    rows().should('have.length', 2)
    cy.contains('.ant-table-row', 'Kit periféricos estoque').should('contain', 'Nível 1')
    cy.contains('.ant-table-row', 'Switch rede predial').should('contain', 'Nível 2')
    cy.get('.ant-table').should('not.contain', 'CC-ADM-02')
  })

  it('"Analisar" opens the request detail', () => {
    cy.login(USERS.admin1)
    cy.visit('/approvals')
    cy.contains('.ant-table-row', 'Notebooks para o time de TI').contains('button', 'Analisar').click()
    cy.location('pathname').should('match', /^\/requests\/[0-9a-f-]+$/)
    cy.contains('button', 'Aprovar')
  })

  it('[SOD-02] segregation of duties: after approving a step, the same person no longer sees the request', () => {
    cy.login(USERS.admin1)
    cy.visit('/approvals')
    rows().should('have.length', 4)
    cy.contains('.ant-table-row', 'Plataforma e-sign').contains('button', 'Analisar').click()
    cy.contains('button', 'Aprovar').click() // N1 of a R$ 3.000 SOFTWARE chain [N1, N2, ADMIN]
    cy.modal().contains('button', 'Aprovar').click()
    cy.toast('Etapa aprovada.')

    cy.visit('/approvals')
    rows().should('have.length', 3)
    cy.get('.ant-table').should('not.contain', 'Plataforma e-sign')

    cy.login(USERS.admin2) // a different admin can still take the next step (N2)
    cy.visit('/approvals')
    cy.contains('.ant-table-row', 'Plataforma e-sign').should('contain', 'Nível 2')
  })

  it('sorts by total and filters by cost center (antd table)', () => {
    cy.login(USERS.admin1)
    cy.visit('/approvals')
    rows().should('have.length', 4)
    cy.contains('.ant-table-thead th', 'Total').click() // ascending
    rows().first().should('contain', 'Kit periféricos estoque') // R$ 900,00
    cy.contains('.ant-table-thead th', 'Total').click() // descending
    rows().first().should('contain', 'Notebooks para o time de TI') // R$ 24.499,50
    cy.tableFilter('Centro', 'CC-ADM-02')
    rows()
      .should('have.length', 2)
      .each((row) => cy.wrap(row).should('contain', 'CC-ADM-02'))
  })

  it('[INBOX-02] SOLICITANTE has no inbox: no menu entry and a 403 page on direct access', () => {
    cy.login(USERS.solicTi)
    cy.get('.ant-menu').should('not.contain', 'Caixa de aprovação')
    cy.visit('/approvals')
    cy.contains('.ant-result', 'Acesso negado')
  })
})
