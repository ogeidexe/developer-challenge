import { USERS } from '../support/commands'

const rows = () => cy.get('.ant-table-tbody .ant-table-row')

describe('Request list screen', () => {
  beforeEach(() => cy.login(USERS.admin1))

  it('lists the visible requests and opens the detail on row click', () => {
    cy.visit('/requests')
    rows().should('have.length', 9) // 10 seeded − 1 draft owned by someone else
    cy.contains('.ant-table-row', 'Notebooks para o time de TI').click()
    cy.location('pathname').should('match', /^\/requests\/[0-9a-f-]+$/)
    cy.contains('Notebooks para o time de TI')
  })

  it("never lists another user's draft", () => {
    cy.visit('/requests')
    cy.get('.ant-table').should('not.contain', 'Monitores para o time de suporte')
  })

  it('status filter goes to the URL and survives a reload (shareable link)', () => {
    cy.visit('/requests')
    cy.antSelectByPlaceholder('Status', 'Em aprovação')
    cy.location('search').should('contain', 'status=PENDING_APPROVAL')
    rows()
      .should('have.length', 4)
      .each((row) => cy.wrap(row).should('contain', 'Em aprovação'))
    cy.reload()
    rows().should('have.length', 4)
    cy.get('.ant-select-selection-item').should('contain', 'Em aprovação')
  })

  it('opens directly from a shared URL with filters applied', () => {
    cy.visit('/requests?category=SOFTWARE')
    rows().should('have.length', 2)
    cy.contains('.ant-table-row', 'Antivírus corporativo')
    cy.contains('.ant-table-row', 'Plataforma e-sign')
  })

  it('searches by title', () => {
    cy.visit('/requests')
    cy.get('input[placeholder="Buscar no título"]').type('notebook{enter}')
    cy.location('search').should('contain', 'q=notebook')
    rows().should('have.length', 1).first().should('contain', 'Notebooks para o time de TI')
  })

  it('sorts by total on the server (asc, then desc) and reflects it in the URL', () => {
    cy.visit('/requests')
    cy.contains('th', 'Total').click()
    cy.location('search').should('contain', 'sort=total%2Casc')
    rows().first().should('contain', 'Kit periféricos estoque') // R$ 900,00
    cy.contains('th', 'Total').click()
    cy.location('search').should('contain', 'sort=total%2Cdesc')
    rows().first().should('contain', 'Servidor virtualização') // R$ 49.200,00
  })

  it('shows an empty state for filters with no result and clears them', () => {
    cy.visit('/requests?createdFrom=2000-01-01&createdTo=2000-01-31')
    cy.contains('Nenhuma solicitação encontrada com esses filtros')
    cy.contains('button', 'Limpar filtros').click()
    cy.location('search').should('eq', '')
    rows().should('have.length', 9)
  })

  it('"Nova solicitação" opens the form', () => {
    cy.visit('/requests')
    cy.contains('button', 'Nova solicitação').click()
    cy.location('pathname').should('eq', '/requests/new')
  })
})
