import { USERS } from '../support/commands'

const tab = (label: string) => cy.contains('.ant-tabs-tab', label).click()

describe('Administration screen', () => {
  it('is ADMIN-only: no menu entry and a 403 page for other roles', () => {
    cy.login(USERS.aprov2Ti)
    cy.get('.ant-menu').should('not.contain', 'Administração')
    cy.visit('/admin')
    cy.contains('.ant-result', 'Acesso negado')
  })

  describe('as ADMIN', () => {
    beforeEach(() => {
      cy.login(USERS.admin1)
      cy.get('.ant-menu').contains('Administração').click()
    })

    it('lists users and creates an APROVADOR (level required)', () => {
      cy.get('.ant-tabs-tabpane-active .ant-table-row').should('have.length', 8)
      cy.contains('button', 'Novo usuário').click()
      cy.get('#user_email').type('novo.aprovador@kingspan.test')
      cy.get('#user_password').type('Senha1234')
      cy.get('#user_name').type('Novo Aprovador')
      cy.antSelect('#user_role', 'Aprovador')
      cy.antSelect('#user_costCenterId', 'CC-TI-01')
      cy.modal().contains('button', 'Salvar').click()
      cy.modal().contains('.ant-form-item-explain-error', 'Obrigatório para Aprovador')

      cy.antSelect('#user_approverLevel', 'Nível 1')
      cy.modal().contains('button', 'Salvar').click()
      cy.toast('Usuário criado.')
      cy.contains('.ant-table-row', 'novo.aprovador@kingspan.test').should('contain', 'Aprovador').and('contain', 'CC-TI-01')
    })

    it('creates a cost center and refuses a duplicate code', () => {
      tab('Centros de custo')
      cy.contains('button', 'Novo centro').click()
      cy.get('#costCenter_code').type('CC-MKT-03')
      cy.get('#costCenter_name').type('Marketing')
      cy.modal().contains('button', 'Criar').click()
      cy.toast('Centro de custo criado.')
      cy.contains('.ant-table-row', 'CC-MKT-03').should('contain', 'Marketing')

      cy.contains('button', 'Novo centro').click()
      cy.get('#costCenter_code').type('CC-TI-01')
      cy.get('#costCenter_name').type('Duplicado')
      cy.modal().contains('button', 'Criar').click()
      cy.get('.ant-message').should('contain', 'CC-TI-01')
    })

    it('sets a monthly budget; below the consumed amount is refused by the backend (422)', () => {
      tab('Orçamentos')
      cy.antSelectByPlaceholder('Centro de custo', 'CC-TI-01')
      cy.contains('.ant-statistic', 'Consumido').contains(/49\.200,00/)

      cy.get('#budget_amount').type('40000')
      cy.contains('button', 'Definir').click()
      cy.contains('.ant-form-item-explain-error', 'abaixo do já consumido')

      cy.get('#budget_amount').clear().type('60000')
      cy.contains('button', 'Definir').click()
      cy.toast('Orçamento definido.')
      cy.contains('.ant-statistic', 'Orçado').contains(/60\.000,00/)
      cy.contains('.ant-statistic', 'Disponível').contains(/10\.800,00/)
    })
  })
})
