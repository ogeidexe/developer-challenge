import { PASSWORD, USERS } from '../support/commands'

// SEC-F02 (CWE-601) — after login the app only follows same-origin, app-relative return URLs.
describe('Security — returnUrl after login', () => {
  const signIn = () => {
    cy.get('#login_email').clear().type(USERS.solicTi)
    cy.get('#login_password').clear().type(PASSWORD)
    cy.contains('button', /^Entrar$/).click()
  }

  const hostile: Record<string, string> = {
    'absolute URL': 'https://evil.example/phish',
    'protocol-relative URL': '//evil.example/phish',
    'backslash (GHSA-wrjc-x8rr-h8h6)': '/\\evil.example/phish',
    'double backslash': '\\\\evil.example',
    'javascript: URL': 'javascript:alert(document.domain)',
    'tab smuggling ("/<TAB>/host")': '/\t/evil.example',
    'login loop': '/login?returnUrl=/login',
  }

  Object.entries(hostile).forEach(([name, target]) => {
    it(`ignores a hostile returnUrl: ${name}`, () => {
      cy.visit(`/login?returnUrl=${encodeURIComponent(target)}`)
      signIn()
      cy.contains('h3', 'Olá, Sofia Lima')
      cy.location().should((loc) => {
        expect(loc.origin).to.eq(Cypress.config('baseUrl'))
        expect(loc.pathname).to.eq('/')
      })
    })
  })

  it('keeps a legitimate in-app returnUrl, query string included', () => {
    cy.visit(`/login?returnUrl=${encodeURIComponent('/requests?status=PENDING_APPROVAL')}`)
    signIn()
    cy.location('pathname').should('eq', '/requests')
    cy.location('search').should('contain', 'status=PENDING_APPROVAL')
  })
})
