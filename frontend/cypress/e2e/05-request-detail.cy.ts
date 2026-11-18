import { USERS } from '../support/commands'

const stepTitles = () => cy.get('.ant-steps-item-title')
const decide = (button: string, ok: string, comment?: string) => {
  cy.contains('button', button).click()
  if (comment) cy.get('#decision_comment').type(comment)
  cy.modal().contains('button', ok).click()
}

describe('Request detail screen — approval workflow', () => {
  it('[FLOW-01][BUDGET-02] video flow: > R$ 10.000 → N1 → N2 → ADMIN → APPROVED and the budget is consumed', () => {
    // requester creates and submits
    cy.login(USERS.solicAdm)
    cy.visit('/requests/new')
    cy.get('#request_title').type('Servidor de arquivos E2E')
    cy.antSelect('#request_category', 'Equipamento')
    cy.get('#request_items_0_description').type('Servidor de arquivos')
    cy.get('#request_items_0_unitPrice').type('12000')
    cy.contains('button', 'Criar rascunho').click()
    cy.contains('button', 'Submeter').click()
    cy.confirmPopover('Submeter')
    cy.toast('Solicitação submetida.')
    cy.contains('.ant-tag', 'Em aprovação')
    stepTitles().should('have.length', 3)
    stepTitles().eq(0).should('have.text', 'Nível 1')
    stepTitles().eq(1).should('have.text', 'Nível 2')
    stepTitles().eq(2).should('have.text', 'Admin')
    cy.contains('button', 'Aprovar').should('not.exist') // the owner never gets approval actions

    // N1 → N2 → ADMIN, each by a different, eligible person
    for (const approver of [USERS.aprov1Adm, USERS.aprov2Adm, USERS.admin1]) {
      cy.login(approver)
      cy.openRequest('Servidor de arquivos E2E')
      decide('Aprovar', 'Aprovar')
      cy.toast('Etapa aprovada.')
    }
    cy.contains('.ant-tag', 'Aprovada')
    cy.get('.ant-steps-item-finish').should('have.length', 3)
    cy.contains('Nenhuma ação disponível para você neste status.')

    // CC-ADM-02: 12.000 (seed) + 12.000 (this request)
    cy.visit('/')
    cy.contains('.ant-table-row', 'CC-ADM-02').should('contain', '24.000,00')
  })

  it('[CHAIN-02] builds the chain from value AND category: SOFTWARE under R$ 1.000 ends with ADMIN', () => {
    cy.apiAs(USERS.solicTi, 'POST', '/requests', {
      title: 'Licença editor E2E',
      category: 'SOFTWARE',
      items: [{ description: 'Licença anual', quantity: 1, unitPrice: '500.00' }],
    }).then(({ json }) =>
      cy.apiAs(USERS.solicTi, 'POST', `/requests/${json.id}/submit`, { lockVersion: json.lockVersion }),
    )
    cy.login(USERS.solicTi)
    cy.openRequest('Licença editor E2E')
    stepTitles().should('have.length', 2)
    stepTitles().eq(0).should('have.text', 'Nível 1')
    stepTitles().eq(1).should('have.text', 'Admin')
  })

  it('[FE-04] renders actions only from allowedActions, per user', () => {
    cy.login(USERS.solicTi) // owner of a pending request: can only cancel
    cy.openRequest('Kit periféricos estoque')
    cy.contains('button', 'Cancelar')
    cy.contains('button', 'Aprovar').should('not.exist')
    cy.contains('button', 'Editar').should('not.exist')

    cy.login(USERS.aprov1Ti) // eligible approver of the current step
    cy.openRequest('Kit periféricos estoque')
    cy.contains('button', 'Aprovar')
    cy.contains('button', 'Devolver p/ ajuste')
    cy.contains('button', 'Rejeitar')
    cy.contains('button', 'Editar').should('not.exist')
  })

  it('[FLOW-03][FE-05] reject requires a comment of at least 10 characters, then closes the chain', () => {
    cy.login(USERS.aprov1Ti)
    cy.openRequest('Kit periféricos estoque')
    decide('Rejeitar', 'Rejeitar', 'curto')
    cy.modal().contains('.ant-form-item-explain-error', 'Mínimo de 10 caracteres')
    cy.get('#decision_comment').clear().type('Fora do orçamento deste trimestre.')
    cy.modal().contains('button', 'Rejeitar').click()

    cy.toast('Solicitação rejeitada.')
    cy.contains('.ant-tag', 'Rejeitada')
    cy.contains('.ant-steps-item', 'Nível 1').should('contain', 'Rejeitada')
    cy.get('.ant-timeline').should('contain', 'Rejeitada').and('contain', 'Fora do orçamento deste trimestre.')
  })

  it('[VER-01] return → edit → resubmit creates v2; v1 stays immutable and viewable', () => {
    cy.login(USERS.aprov2Ti)
    cy.openRequest('Switch rede predial')
    decide('Devolver p/ ajuste', 'Devolver', 'Detalhar a quantidade de portas necessárias.')
    cy.toast('Solicitação devolvida para ajuste.')
    cy.contains('.ant-tag', 'Devolvida p/ ajuste')

    cy.login(USERS.solicTi)
    cy.openRequest('Switch rede predial')
    cy.contains('button', 'Editar').click()
    cy.get('#request_items_0_quantity').clear().type('2')
    cy.contains('button', 'Salvar alterações').click()
    cy.contains('Itens da próxima versão (v2')
    cy.contains('button', 'Reenviar (v2)').click()
    cy.confirmPopover('Submeter')

    cy.toast('Solicitação submetida.')
    cy.contains('h3', 'v2')
    cy.contains('.ant-tag', 'Em aprovação')
    cy.contains('.ant-descriptions-item', 'Total').contains(/10\.000,00/)
    // v1 is still there, frozen, with its own chain outcome
    cy.contains('.ant-segmented-item', 'v1').click()
    cy.contains('versão anterior (imutável)')
    cy.contains('.ant-steps-item', 'Nível 1').should('contain', 'Aprovada')
    cy.contains('.ant-steps-item', 'Nível 2').should('contain', 'Devolvida')
    cy.contains('.ant-table', 'Switch gerenciável 48 portas').should('contain', '5.000,00')
  })

  it('[BUDGET-01][FE-06] BUDGET_EXCEEDED: explains the reason, keeps the request pending and audits the attempt', () => {
    cy.login(USERS.aprov1Ti) // R$ 900,00 request, CC-TI-01 has only R$ 800,00 left
    cy.openRequest('Kit periféricos estoque')
    decide('Aprovar', 'Aprovar')
    cy.modal().find('.ant-alert-error').should('contain', 'CC-TI-01').and('contain', 'disponíveis em')
    cy.modal().contains('button', 'Voltar').click()
    cy.contains('.ant-tag', 'Em aprovação')
    cy.contains('.ant-steps-item', 'Nível 1').should('contain', 'Pendente')
    cy.get('.ant-timeline').should('contain', 'Aprovação recusada — orçamento insuficiente')
  })

  it('[FE-06] 409: someone acted first — the user is told and the screen refreshes', () => {
    cy.login(USERS.admin1)
    cy.openRequest('Notebooks para o time de TI')
    cy.contains('button', 'Aprovar')
    // a second admin approves the same step "in another browser"
    cy.requestIdByTitle(USERS.admin2, 'Notebooks para o time de TI').then((id) =>
      cy
        .apiAs(USERS.admin2, 'GET', `/requests/${id}`)
        .then(({ json }) =>
          cy.apiAs(USERS.admin2, 'POST', `/requests/${id}/approve`, { lockVersion: json.lockVersion }),
        ),
    )
    decide('Aprovar', 'Aprovar') // our screen still holds the old lockVersion
    cy.contains('.ant-alert-warning', 'Alguém agiu antes de você (409)')
    cy.contains('.ant-tag', 'Aprovada')
    cy.contains('button', 'Aprovar').should('not.exist')
  })

  it('[FLOW-04] owner submits a draft and cancels another one', () => {
    cy.login(USERS.solicTi)
    cy.openRequest('Monitores para o time de suporte')
    cy.contains('button', 'Submeter').click()
    cy.confirmPopover('Submeter')
    cy.contains('.ant-tag', 'Em aprovação')
    stepTitles().should('have.length', 2) // R$ 7.199,20 → N1, N2
    cy.contains('button', 'Cancelar').click()
    cy.confirmPopover('Cancelar solicitação')
    cy.toast('Solicitação cancelada.')
    cy.contains('.ant-tag', 'Cancelada')
    cy.contains('.ant-steps-item', 'Nível 1').should('contain', 'Cancelada')
    cy.contains('.ant-steps-item', 'Nível 2').should('contain', 'Não alcançada')
  })
})
