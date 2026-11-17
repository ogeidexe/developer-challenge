import { USERS } from '../support/commands'

describe('Login screen', () => {
  it('signs in and lands on the dashboard', () => {
    cy.login(USERS.admin1)
    cy.location('pathname').should('eq', '/')
    cy.contains('h3', 'Olá, Admin Um')
  })

  it('rejects wrong credentials with a clear message and stays on /login', () => {
    cy.visit('/login')
    cy.get('#login_email').clear().type(USERS.solicTi)
    cy.get('#login_password').clear().type('senhaErrada1')
    cy.contains('button', /^Entrar$/).click()
    cy.contains('.ant-alert-error', 'Credenciais inválidas')
    cy.location('pathname').should('eq', '/login')
  })

  it('validates the form on the client before calling the API', () => {
    cy.visit('/login')
    cy.get('#login_email').clear()
    cy.get('#login_password').clear().type('123')
    cy.contains('button', /^Entrar$/).click()
    cy.contains('.ant-form-item-explain-error', 'E-mail inválido')
    cy.contains('.ant-form-item-explain-error', 'Mínimo de 8 caracteres')
  })

  it('fills the form from the demo-user picker', () => {
    cy.visit('/login')
    cy.antSelectByPlaceholder('Preencher com um usuário do seed', 'Sofia Lima')
    cy.get('#login_email').should('have.value', USERS.solicTi)
    cy.contains('button', /^Entrar$/).click()
    cy.contains('h3', 'Olá, Sofia Lima')
  })

  it('public registration always creates a SOLICITANTE and signs in', () => {
    cy.visit('/login')
    cy.contains('.ant-segmented-item', 'Criar conta').click()
    cy.get('#login_name').type('Nova Pessoa')
    cy.antSelect('#login_costCenterId', 'CC-TI-01')
    cy.get('#login_email').clear().type('nova.pessoa@kingspan.test')
    cy.get('#login_password').clear().type('Senha1234')
    cy.get('#login_confirmPassword').type('Senha1234')
    cy.contains('button', 'Criar conta (Solicitante) e entrar').click()
    cy.contains('h3', 'Olá, Nova Pessoa')
    cy.get('.ant-layout-header').contains('Solicitante')
    cy.get('.ant-menu').should('not.contain', 'Caixa de aprovação')
  })

  it('sends an anonymous visitor to /login and back to the original route afterwards', () => {
    cy.visit('/requests?status=APPROVED')
    cy.location('pathname').should('eq', '/login')
    cy.location('search').should('contain', 'returnUrl=%2Frequests%3Fstatus%3DAPPROVED')
    cy.get('#login_email').clear().type(USERS.admin1)
    cy.contains('button', /^Entrar$/).click()
    cy.location('pathname').should('eq', '/requests')
    cy.location('search').should('eq', '?status=APPROVED')
  })

  it('handles an expired session (401): back to login, then back to where the user was', () => {
    cy.login(USERS.admin1)
    // invalidate the token without reloading — the next API call gets 401
    cy.window().then((win) => {
      const s = JSON.parse(win.sessionStorage.getItem('kp_auth')!)
      win.sessionStorage.setItem('kp_auth', JSON.stringify({ ...s, token: 'expired-token' }))
    })
    cy.get('.ant-menu').contains('Solicitações').click()
    cy.location('pathname').should('eq', '/login')
    cy.location('search').should('contain', 'returnUrl=%2Frequests')
    cy.get('#login_email').clear().type(USERS.admin1)
    cy.contains('button', /^Entrar$/).click()
    cy.location('pathname').should('eq', '/requests')
  })

  it('logs out from the user menu', () => {
    cy.login(USERS.aprov1Ti)
    cy.get('.ant-layout-header').contains('button', 'João Nunes').click()
    cy.get('.ant-dropdown-menu').contains('Sair').click()
    cy.location('pathname').should('eq', '/login')
  })

  describe('Criar conta — validations (antd Form)', () => {
    const openSignUp = () => {
      cy.visit('/login')
      cy.contains('.ant-segmented-item', 'Criar conta').click()
    }
    const nameError = () => cy.get('#login_name').closest('.ant-form-item').find('.ant-form-item-explain-error')

    it('lists the cost centers in the sign-up form', () => {
      openSignUp()
      cy.get('#login_costCenterId').closest('.ant-select').click()
      cy.get('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        .last()
        .within(() => {
          cy.contains('.ant-select-item-option', 'CC-TI-01')
          cy.contains('.ant-select-item-option', 'CC-ADM-02')
        })
    })

    it('requires a full name with letters only (accents allowed; no comma, hyphen or digits)', () => {
      openSignUp()
      for (const invalid of ['Jo', 'José', 'João-Silva Souza', 'Silva, João', 'Ana Costa2']) {
        cy.get('#login_name').clear().type(invalid).blur()
        nameError().should('be.visible')
      }
      cy.get('#login_name').clear().type('José da Silva').blur()
      nameError().should('not.exist')
    })

    it('shows a password strength meter', () => {
      openSignUp()
      cy.get('#login_password').clear().type('abc')
      cy.get('[data-testid="password-strength"]').should('contain', 'Fraca')
      cy.get('#login_password').clear().type('senha1234')
      cy.get('[data-testid="password-strength"]').should('contain', 'Razoável')
      cy.get('#login_password').clear().type('Senha12345678')
      cy.get('[data-testid="password-strength"]').should('contain', 'Boa')
      cy.get('#login_password').clear().type('Senha-Forte#2026')
      cy.get('[data-testid="password-strength"]').should('contain', 'Forte')
    })

    it('requires the password confirmation to match', () => {
      openSignUp()
      cy.get('#login_name').type('Nova Pessoa')
      cy.antSelect('#login_costCenterId', 'CC-TI-01')
      cy.get('#login_email').clear().type('outra.pessoa@kingspan.test')
      cy.get('#login_password').clear().type('Senha1234')
      cy.get('#login_confirmPassword').type('Senha9999')
      cy.contains('button', 'Criar conta (Solicitante) e entrar').click()
      cy.get('#login_confirmPassword').closest('.ant-form-item').should('contain', 'As senhas não conferem')
      cy.location('pathname').should('eq', '/login')
    })
  })

  it('shows the company logo on the login card, the top bar and as the favicon', () => {
    cy.visit('/login')
    cy.get('.ant-card img[src="/logo.svg"]').should('be.visible')
    cy.get('link[rel="icon"]').should('have.attr', 'href', '/logo.svg')
    cy.login(USERS.admin1)
    cy.get('.ant-layout-header img[src="/logo.svg"]').should('be.visible')
  })
})
