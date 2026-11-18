// Real API: BUDGET_EXCEEDED (422) and return → resubmit as v2, on the seed requests made for them.
import { USERS } from '../support/commands'

describe('Real API — budget and versions', () => {
  it('[BUDGET-01][FE-06] BUDGET_EXCEEDED: explains the reason, keeps the request pending and audits the attempt', () => {
    cy.login(USERS.aprov1Ti) // "Kit periféricos estoque" costs R$ 900,00; CC-TI-01 has R$ 800,00 left
    cy.openRequest('Kit periféricos estoque')
    cy.contains('button', 'Aprovar').click()
    cy.modal().contains('button', 'Aprovar').click()
    cy.modal().find('.ant-alert-error').should('contain', 'CC-TI-01').and('contain', 'disponíveis em')
    cy.modal().contains('button', 'Voltar').click()
    cy.reload()
    cy.contains('.ant-tag', 'Em aprovação')
    cy.contains('.ant-steps-item', 'Nível 1').should('contain', 'Pendente')
    cy.get('.ant-timeline').should('contain', 'orçamento insuficiente')
  })

  it('[VER-01] resubmitting a returned request creates v2; v1 stays immutable and viewable', () => {
    cy.login(USERS.solicTi) // "Antivírus corporativo": returned at N1, working copy already edited to 35 licenses
    cy.openRequest('Antivírus corporativo')
    cy.contains('.ant-tag', 'Devolvida p/ ajuste')
    cy.contains('button', 'Reenviar (v2)').click()
    cy.confirmPopover('Submeter')
    cy.toast('Solicitação submetida.')
    cy.contains('h3', 'v2')
    cy.contains('.ant-tag', 'Em aprovação')
    cy.contains('.ant-descriptions-item', 'Total').contains(/4\.200,00/) // 35 × 120,00
    cy.contains('.ant-segmented-item', 'v1').click()
    cy.contains('versão anterior (imutável)')
    cy.contains('.ant-steps-item', 'Nível 1').should('contain', 'Devolvida')
    cy.contains('.ant-table', 'Licença anual de antivírus corporativo').should('contain', '4.800,00') // 40 × 120,00
  })
})
