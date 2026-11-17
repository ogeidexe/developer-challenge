import { USERS } from '../support/commands'

const stat = (title: string) => cy.contains('.ant-statistic', title).find('.ant-statistic-content-value')
const budgetRow = (code: string) => cy.contains('.ant-table-row', code)

describe('Dashboard screen', () => {
  it('ADMIN: totals of every non-draft request and the budget of every cost center', () => {
    cy.login(USERS.admin1)
    stat('Rascunho').should('have.text', '0') // drafts are owner-only, ADMIN included (A-26)
    stat('Em aprovação').should('have.text', '4')
    stat('Devolvida p/ ajuste').should('have.text', '1')
    stat('Aprovada').should('have.text', '2')
    stat('Rejeitada').should('have.text', '1')
    stat('Cancelada').should('have.text', '1')

    budgetRow('CC-TI-01').should('contain', '50.000,00').and('contain', '49.200,00').and('contain', '800,00')
    budgetRow('CC-ADM-02').should('contain', '80.000,00').and('contain', '12.000,00').and('contain', '68.000,00')
    cy.contains('Tempo médio de aprovação')
  })

  it('budget table sorts by available amount (antd table)', () => {
    cy.login(USERS.admin1)
    cy.contains('.ant-table-thead th', 'Disponível').click() // ascending
    cy.get('.ant-table-tbody .ant-table-row').first().should('contain', 'CC-TI-01') // R$ 800,00
    cy.contains('.ant-table-thead th', 'Disponível').click() // descending
    cy.get('.ant-table-tbody .ant-table-row').first().should('contain', 'CC-ADM-02') // R$ 68.000,00
  })

  it('SOLICITANTE: only own requests and only own cost center budget', () => {
    cy.login(USERS.solicTi)
    stat('Rascunho').should('have.text', '1')
    stat('Em aprovação').should('have.text', '2')
    stat('Devolvida p/ ajuste').should('have.text', '1')
    stat('Aprovada').should('have.text', '1')
    stat('Rejeitada').should('have.text', '1')
    stat('Cancelada').should('have.text', '0')
    budgetRow('CC-TI-01').should('exist')
    cy.get('.ant-table').should('not.contain', 'CC-ADM-02')
  })

  it("APROVADOR: requests of the own cost center, without other people's drafts", () => {
    cy.login(USERS.aprov1Adm)
    stat('Rascunho').should('have.text', '0')
    stat('Em aprovação').should('have.text', '2')
    stat('Aprovada').should('have.text', '1')
    stat('Cancelada').should('have.text', '1')
    budgetRow('CC-ADM-02').should('exist')
    cy.get('.ant-table').should('not.contain', 'CC-TI-01')
  })
})
