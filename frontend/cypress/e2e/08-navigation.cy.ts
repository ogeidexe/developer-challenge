import { USERS } from '../support/commands'

describe('Navigation, guards and error pages', () => {
  it('sidebar shows only the sections each role may use', () => {
    cy.login(USERS.solicTi)
    cy.get('.ant-menu-item').should('have.length', 2)
    cy.login(USERS.aprov1Ti)
    cy.get('.ant-menu-item').should('have.length', 3).last().should('contain', 'Caixa de aprovação')
    cy.login(USERS.admin1)
    cy.get('.ant-menu-item').should('have.length', 4).last().should('contain', 'Administração')
  })

  it('unknown route shows the 404 page', () => {
    cy.login(USERS.admin1)
    cy.visit('/does-not-exist')
    cy.contains('.ant-result', 'Página não encontrada')
    cy.contains('button', 'Voltar ao início').click()
    cy.location('pathname').should('eq', '/')
  })

  it("a request outside the user's visibility answers 404 — even for ADMIN on someone else's draft (ADR-012)", () => {
    cy.requestIdByTitle(USERS.solicTi, 'Monitores para o time de suporte').then((id) => {
      cy.login(USERS.admin1)
      cy.visit(`/requests/${id}`)
      cy.contains('.ant-result', 'Solicitação não encontrada')
    })
  })

  it('a request from another cost center is invisible to an APROVADOR', () => {
    cy.requestIdByTitle(USERS.admin1, 'Notebooks para o time de TI').then((id) => {
      cy.login(USERS.aprov1Ti) // CC-TI-01; the request belongs to CC-ADM-02
      cy.visit(`/requests/${id}`)
      cy.contains('.ant-result', 'Solicitação não encontrada')
    })
  })

  it('data survives a page reload, and "Reiniciar dados" restores the seed', () => {
    cy.login(USERS.solicTi)
    cy.openRequest('Monitores para o time de suporte')
    cy.contains('button', 'Cancelar').click()
    cy.confirmPopover('Cancelar solicitação')
    cy.contains('.ant-tag', 'Cancelada')
    cy.reload()
    cy.contains('.ant-tag', 'Cancelada')

    cy.get('.ant-layout-header').contains('button', 'Sofia Lima').click()
    cy.get('.ant-dropdown-menu').contains('Reiniciar dados de demonstração').click()
    cy.location('pathname').should('eq', '/login')
    cy.login(USERS.solicTi)
    cy.openRequest('Monitores para o time de suporte')
    cy.contains('.ant-tag', 'Rascunho')
  })
})
