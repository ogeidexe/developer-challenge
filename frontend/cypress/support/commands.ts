/// <reference types="cypress" />
// Reusable steps for the E2E suite. Selectors prefer what a user sees (labels, button text) and the
// ids antd derives from named forms (`<Form name="request">` → `#request_title`).

export const PASSWORD = 'Kingspan@123'

export const USERS = {
  admin1: 'admin1@kingspan.test',
  admin2: 'admin2@kingspan.test',
  solicTi: 'solic.ti@kingspan.test',
  aprov1Ti: 'aprov1.ti@kingspan.test',
  aprov2Ti: 'aprov2.ti@kingspan.test',
  solicAdm: 'solic.adm@kingspan.test',
  aprov1Adm: 'aprov1.adm@kingspan.test',
  aprov2Adm: 'aprov2.adm@kingspan.test',
} as const

// Fake-API responses are untyped JSON; specs assert on the fields they need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate: response shape varies per endpoint
type ApiJson = any

type MockHandle = (req: {
  method: string
  path: string
  query: URLSearchParams
  body?: unknown
  headers: Record<string, string>
}) => Promise<{ status: number; json: ApiJson }>

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Signs in through the login screen. Keeps the fake DB (localStorage); drops only the session. */
      login(email: string, password?: string): Chainable<void>
      /** Picks an option of the antd <Select> that owns `selector` (an input id or a wrapper). */
      antSelect(selector: string, option: string | RegExp): Chainable<void>
      /** Picks an option of the antd <Select> showing `placeholder`. */
      antSelectByPlaceholder(placeholder: string, option: string | RegExp): Chainable<void>
      /** Clicks the confirm button of the open Popconfirm. */
      confirmPopover(okText: string | RegExp): Chainable<void>
      /** The currently visible antd modal. */
      modal(): Chainable<JQuery<HTMLElement>>
      /** Calls the fake API as another user (a "second browser") — e.g. to provoke a 409. */
      apiAs(email: string, method: string, path: string, body?: unknown): Chainable<{ status: number; json: ApiJson }>
      /** Finds a request id by title, as seen by `email`. */
      requestIdByTitle(email: string, title: string): Chainable<string>
      /** Opens a request from the list screen by clicking its row. */
      openRequest(title: string): Chainable<void>
      /** Asserts an antd message toast. */
      toast(text: string | RegExp): Chainable<void>
    }
  }
}

Cypress.Commands.add('login', (email: string, password = PASSWORD) => {
  cy.visit('/login', { onBeforeLoad: (win) => win.sessionStorage.clear() })
  cy.get('#login_email').clear().type(email)
  cy.get('#login_password').clear().type(password, { log: false })
  cy.contains('button', /^Entrar$/).click()
  cy.location('pathname').should('not.eq', '/login')
})

Cypress.Commands.add('antSelect', (selector: string, option: string | RegExp) => {
  cy.get(selector).closest('.ant-select').click()
  cy.get('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last()
    .contains('.ant-select-item-option', option)
    .click()
})

Cypress.Commands.add('antSelectByPlaceholder', (placeholder: string, option: string | RegExp) => {
  cy.contains('.ant-select-selection-placeholder', placeholder).closest('.ant-select').click()
  cy.get('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last()
    .contains('.ant-select-item-option', option)
    .click()
})

Cypress.Commands.add('confirmPopover', (okText: string | RegExp) => {
  cy.get('.ant-popover:not(.ant-popover-hidden)').last().contains('button', okText).click()
})

Cypress.Commands.add('modal', () => cy.get('.ant-modal-content').filter(':visible').last())

Cypress.Commands.add('toast', (text: string | RegExp) => {
  cy.get('.ant-message').contains(text).should('be.visible')
})

Cypress.Commands.add('apiAs', (email: string, method: string, path: string, body?: unknown) => {
  // the hook lives in the app page — load it first when the test has not visited anything yet
  cy.window().then((win) => {
    if (!('__mockBackend' in win)) cy.visit('/login')
  })
  return cy.window().then(async (win) => {
    const handle = (win as unknown as { __mockBackend?: { handle: MockHandle } }).__mockBackend?.handle
    if (!handle) throw new Error('mock backend hook not found — is VITE_MOCK_BACKEND enabled?')
    const call = (m: string, p: string, b?: unknown, token?: string) => {
      const [pathname, qs = ''] = p.split('?')
      return handle({
        method: m,
        path: pathname,
        query: new win.URLSearchParams(qs),
        body: b,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
    }
    const auth = await call('POST', '/auth/login', { email, password: PASSWORD })
    return call(method, path, body, auth.json.token)
  })
})

Cypress.Commands.add('requestIdByTitle', (email: string, title: string) => {
  return cy.apiAs(email, 'GET', `/requests?size=100&q=${encodeURIComponent(title)}`).then((res) => {
    const found = res.json.data.find((r: { title: string }) => r.title === title)
    expect(found, `request "${title}" visible to ${email}`).to.exist
    return found.id as string
  })
})

Cypress.Commands.add('openRequest', (title: string) => {
  // search by title so the row is on page 1 no matter how many requests exist
  cy.visit(`/requests?q=${encodeURIComponent(title)}`)
  cy.contains('.ant-table-row', title).click()
  cy.location('pathname').should('match', /^\/requests\/[0-9a-f-]+$/)
  cy.contains('h3', /REQ-\d+/)
})

export {}
