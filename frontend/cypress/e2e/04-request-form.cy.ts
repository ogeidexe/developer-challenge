import { USERS } from '../support/commands'

const totalPreview = () => cy.contains('.ant-statistic', 'Total (prévia)')

describe('Request form screen (create / edit)', () => {
  beforeEach(() => cy.login(USERS.solicTi))

  it('validates required fields on the client', () => {
    cy.visit('/requests/new')
    cy.contains('button', 'Criar rascunho').click()
    cy.contains('.ant-form-item-explain-error', 'Informe o título')
    cy.contains('.ant-form-item-explain-error', 'Selecione a categoria')
    cy.contains('.ant-form-item-explain-error', 'Descrição obrigatória')
    cy.contains('.ant-form-item-explain-error', 'Informe o preço')
    cy.location('pathname').should('eq', '/requests/new')
  })

  it('refuses a too-short title and never keeps a zero unit price (antd rules)', () => {
    cy.visit('/requests/new')
    cy.get('#request_title').type('AB').blur()
    cy.contains('.ant-form-item-explain-error', 'Entre 3 e 120 caracteres')
    // the price InputNumber (min 0,01) clamps a typed zero; the moneyRules validator is the backstop for pasted values
    cy.get('#request_items_0_unitPrice').type('0').blur()
    cy.get('#request_items_0_unitPrice').should('have.value', '0,01')
  })

  it("defaults the cost center to the requester's own", () => {
    cy.visit('/requests/new')
    cy.get('#request_costCenterId').closest('.ant-select').should('contain', 'CC-TI-01')
  })

  it('adds and removes item rows with a live (display-only) total', () => {
    cy.visit('/requests/new')
    cy.get('#request_items_0_quantity').clear().type('5')
    cy.get('#request_items_0_unitPrice').type('4899,90')
    totalPreview().contains(/24\.499,50/)

    cy.contains('button', 'Adicionar item').click()
    cy.get('#request_items_1_description').type('Mouse')
    cy.get('#request_items_1_quantity').clear().type('2')
    cy.get('#request_items_1_unitPrice').type('100')
    totalPreview().contains(/24\.699,50/)

    cy.get('button[aria-label="Remover item"]').eq(1).click()
    cy.get('#request_items_1_description').should('not.exist')
    totalPreview().contains(/24\.499,50/)
    cy.get('button[aria-label="Remover item"]').first().should('be.disabled') // at least one item
  })

  it('creates a DRAFT; the detail shows the server-computed total and the owner actions', () => {
    cy.visit('/requests/new')
    cy.get('#request_title').type('Notebooks E2E')
    cy.get('#request_description').type('Criado pelo teste end-to-end')
    cy.antSelect('#request_category', 'Equipamento')
    cy.get('#request_items_0_description').type('Notebook 16GB/512GB')
    cy.get('#request_items_0_quantity').clear().type('5')
    cy.get('#request_items_0_unitPrice').type('4899,90')
    cy.contains('button', 'Criar rascunho').click()

    cy.toast('Rascunho criado.')
    cy.location('pathname').should('match', /^\/requests\/[0-9a-f-]+$/)
    cy.contains('.ant-tag', 'Rascunho')
    cy.contains('.ant-descriptions-item', 'Total').contains(/24\.499,50/)
    cy.contains('button', 'Editar')
    cy.contains('button', 'Submeter')
    cy.contains('button', 'Cancelar')
    cy.contains('A cadeia é montada quando a solicitação é submetida.')
  })

  it('edits a draft (form comes pre-filled) and saves it', () => {
    cy.openRequest('Monitores para o time de suporte')
    cy.contains('button', 'Editar').click()
    cy.location('pathname').should('match', /\/edit$/)
    cy.get('#request_title').should('have.value', 'Monitores para o time de suporte')
    cy.get('#request_items_0_quantity').should('have.value', '8')

    cy.get('#request_title').clear().type('Monitores 27 polegadas')
    cy.get('#request_items_0_quantity').clear().type('4')
    cy.contains('button', 'Salvar alterações').click()

    cy.toast('Solicitação atualizada.')
    cy.contains('Monitores 27 polegadas')
    cy.contains('.ant-descriptions-item', 'Total').contains(/3\.599,60/) // 4 × 899,90
  })
})
