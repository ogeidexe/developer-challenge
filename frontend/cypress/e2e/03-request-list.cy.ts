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

  it("[LIST-04] never lists another user's draft", () => {
    cy.visit('/requests')
    cy.get('.ant-table').should('not.contain', 'Monitores para o time de suporte')
  })

  it('[LIST-02] status column filter (antd) goes to the URL and survives a reload (shareable link)', () => {
    cy.visit('/requests')
    cy.tableFilter('Status', 'Em aprovação')
    cy.location('search').should('contain', 'status=PENDING_APPROVAL')
    rows()
      .should('have.length', 4)
      .each((row) => cy.wrap(row).should('contain', 'Em aprovação'))
    cy.reload()
    rows().should('have.length', 4)
    cy.contains('.ant-table-thead th', 'Status').find('.ant-table-filter-trigger').should('have.class', 'active')
  })

  it('[LIST-02] category and cost center column filters combine on the server', () => {
    cy.visit('/requests')
    cy.tableFilter('Categoria', 'Software')
    cy.location('search').should('contain', 'category=SOFTWARE')
    rows().should('have.length', 2)
    cy.tableFilter('Centro', 'CC-ADM-02')
    cy.location('search').should('contain', 'category=SOFTWARE').and('contain', 'costCenterId=')
    rows().should('have.length', 1).first().should('contain', 'Plataforma e-sign')
  })

  it('[EXTRA-01] total column filter: requests from R$ 10.000', () => {
    cy.visit('/requests')
    cy.openColumnFilter('Total').within(() => {
      cy.get('input[placeholder="Valor mín. (R$)"]').type('10000')
      cy.contains('button', 'Filtrar').click()
    })
    cy.location('search').should('contain', 'minAmount=10000')
    rows().should('have.length', 4)
    cy.contains('.ant-table-row', 'Kit periféricos estoque').should('not.exist')
  })

  it('[LIST-02] opens directly from a shared URL with filters applied', () => {
    cy.visit('/requests?category=SOFTWARE')
    rows().should('have.length', 2)
    cy.contains('.ant-table-row', 'Antivírus corporativo')
    cy.contains('.ant-table-row', 'Plataforma e-sign')
  })

  it('[EXTRA-01] searches by title in the column filter', () => {
    cy.visit('/requests')
    cy.openColumnFilter('Título').within(() => cy.get('input[placeholder="Buscar no título"]').type('notebook{enter}'))
    cy.location('search').should('contain', 'q=notebook')
    rows().should('have.length', 1).first().should('contain', 'Notebooks para o time de TI')
  })

  it('[LIST-01] sorts by total on the server (asc, then desc) and reflects it in the URL', () => {
    cy.visit('/requests')
    cy.contains('th', 'Total').click()
    cy.location('search').should('contain', 'sort=total%2Casc')
    rows().first().should('contain', 'Kit periféricos estoque') // R$ 900,00
    cy.contains('th', 'Total').click()
    cy.location('search').should('contain', 'sort=total%2Cdesc')
    rows().first().should('contain', 'Servidor virtualização') // R$ 49.200,00
  })

  it('[FE-06] shows an empty state for filters with no result and clears them', () => {
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
