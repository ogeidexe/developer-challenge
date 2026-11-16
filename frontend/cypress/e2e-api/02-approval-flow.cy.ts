// Real API: the full approval workflow driven through the UI, plus reject, segregation of duties and 409.
import { USERS } from '../support/commands'

const RUN = Date.now().toString(36) // unique titles, so a second run on the same database still works
const stepTitles = () => cy.get('.ant-steps-item-title')
const decide = (button: string, ok: string, comment?: string) => {
  cy.contains('button', button).click()
  if (comment) cy.get('#decision_comment').type(comment)
  cy.modal().contains('button', ok).click()
}
/** Creates and submits a request as `owner` through the real API; yields its id. */
const createSubmitted = (owner: string, title: string, unitPrice: string, category = 'OTHER') =>
  cy
    .apiAs(owner, 'POST', '/requests', {
      title,
      category,
      items: [{ description: 'Item E2E', quantity: 1, unitPrice }],
    })
    .then(({ status, json }) => {
      expect(status, 'create').to.eq(201)
      return cy.apiAs(owner, 'POST', `/requests/${json.id}/submit`, { lockVersion: json.lockVersion })
    })
    .then(({ status, json }) => {
      expect(status, 'submit').to.eq(200)
      return json.id as string
    })

describe('Real API — approval workflow', () => {
  it('video flow: > R$ 10.000 created in the form → N1 → N2 → ADMIN → APPROVED, budget consumed', () => {
    const title = `Servidor de arquivos ${RUN}`
    cy.login(USERS.solicAdm)
    cy.visit('/requests/new')
    cy.get('#request_title').type(title)
    cy.antSelect('#request_category', 'Equipamento')
    cy.get('#request_items_0_description').type('Servidor de arquivos')
    cy.get('#request_items_0_unitPrice').type('12000')
    cy.contains('button', 'Criar rascunho').click()
    cy.contains('.ant-tag', 'Rascunho')
    cy.contains('.ant-descriptions-item', 'Total').contains(/12\.000,00/) // computed by the backend
    cy.contains('button', 'Submeter').click()
    cy.confirmPopover('Submeter')
    cy.toast('Solicitação submetida.')
    cy.contains('.ant-tag', 'Em aprovação')
    stepTitles().should('have.length', 3)
    stepTitles().eq(2).should('have.text', 'Admin')
    cy.contains('button', 'Aprovar').should('not.exist') // the owner never gets approval actions

    for (const approver of [USERS.aprov1Adm, USERS.aprov2Adm, USERS.admin1]) {
      cy.login(approver)
      cy.openRequest(title)
      decide('Aprovar', 'Aprovar')
      cy.toast('Etapa aprovada.')
    }
    cy.contains('.ant-tag', 'Aprovada')
    cy.get('.ant-steps-item-finish').should('have.length', 3)
    cy.get('.ant-timeline').should('contain', 'Aprovada')
  })

  it('SOFTWARE under R$ 1.000 ends with an ADMIN step (chain built by the backend)', () => {
    const title = `Licença editor ${RUN}`
    createSubmitted(USERS.solicTi, title, '500.00', 'SOFTWARE')
    cy.login(USERS.solicTi)
    cy.openRequest(title)
    stepTitles().should('have.length', 2)
    stepTitles().eq(0).should('have.text', 'Nível 1')
    stepTitles().eq(1).should('have.text', 'Admin')
  })

  it('segregation of duties: after approving NIVEL_1, the same NIVEL_2 approver gets no decision buttons', () => {
    const title = `Switch andar ${RUN}`
    createSubmitted(USERS.solicAdm, title, '5000.00') // → NIVEL_1, NIVEL_2
    cy.login(USERS.aprov2Adm)
    cy.openRequest(title)
    decide('Aprovar', 'Aprovar')
    cy.toast('Etapa aprovada.')
    cy.reload()
    cy.contains('.ant-tag', 'Em aprovação')
    cy.contains('button', 'Aprovar').should('not.exist')
  })

  it('reject requires a 10+ character comment, then closes the chain', () => {
    const title = `Cadeiras ${RUN}`
    createSubmitted(USERS.solicTi, title, '300.00')
    cy.login(USERS.aprov1Ti)
    cy.openRequest(title)
    decide('Rejeitar', 'Rejeitar', 'curto')
    cy.modal().contains('.ant-form-item-explain-error', 'Mínimo de 10 caracteres')
    cy.get('#decision_comment').clear().type('Fora do orçamento deste trimestre.')
    cy.modal().contains('button', 'Rejeitar').click()
    cy.toast('Solicitação rejeitada.')
    cy.contains('.ant-tag', 'Rejeitada')
    cy.get('.ant-timeline').should('contain', 'Fora do orçamento deste trimestre.')
  })

  it('409: another approver acted first — the user is told and the screen refreshes', () => {
    const title = `Mesa reunião ${RUN}`
    createSubmitted(USERS.solicAdm, title, '500.00').then((id) => {
      cy.login(USERS.aprov1Adm)
      cy.openRequest(title)
      cy.contains('button', 'Aprovar')
      // NIVEL_2 of the same center approves the NIVEL_1 step "in another browser"
      cy.apiAs(USERS.aprov2Adm, 'GET', `/requests/${id}`).then(({ json }) =>
        cy.apiAs(USERS.aprov2Adm, 'POST', `/requests/${id}/approve`, { lockVersion: json.lockVersion }),
      )
      decide('Aprovar', 'Aprovar') // this screen still holds the old lockVersion
      cy.contains('.ant-alert-warning', '409')
      cy.contains('.ant-tag', 'Aprovada')
    })
  })
})
