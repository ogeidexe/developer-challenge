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

/** One API call with full control (checklist specs): own token or none, extra request headers. */
export interface ApiRequest {
  method: string
  path: string
  body?: unknown
  /** Bearer token from `cy.apiToken`; omit for an anonymous call. */
  token?: string
  headers?: Record<string, string>
}

/** `headers` is null on the fake backend, which answers JSON only (no HTTP response headers). */
export interface ApiResult {
  status: number
  json: ApiJson
  headers: Record<string, string> | null
}

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
      /** Calls the API as another user (a "second browser") — e.g. to provoke a 409. Fake or real backend. */
      apiAs(email: string, method: string, path: string, body?: unknown): Chainable<{ status: number; json: ApiJson }>
      /** Finds a request id by title, as seen by `email`. */
      requestIdByTitle(email: string, title: string): Chainable<string>
      /** Opens a request from the list screen by clicking its row. */
      openRequest(title: string): Chainable<void>
      /** Asserts an antd message toast. */
      toast(text: string | RegExp): Chainable<void>
      /**
       * Visits like a site served over plain http:// (not a secure context): crypto.randomUUID does not exist there.
       * Starts signed out. Navigate inside the SPA afterwards (a new cy.visit reloads the page and restores it).
       */
      visitWithoutRandomUUID(url: string): Chainable<void>
      /** Signs in through the API (fake or real) and yields the token — e.g. to keep using an old token. */
      apiToken(email: string, password?: string): Chainable<string>
      /** One API call with an explicit token (or none) and extra headers; yields status, JSON and response headers. */
      apiCall(req: ApiRequest): Chainable<ApiResult>
      /** Fires the calls at the same time (Promise.all from the page) — concurrency checks. */
      apiParallel(reqs: ApiRequest[]): Chainable<ApiResult[]>
      /** Opens the antd filter of a table column (by header text). */
      openColumnFilter(column: string): Chainable<JQuery<HTMLElement>>
      /** Picks options in an antd column filter (`filters`) and confirms with OK. */
      tableFilter(column: string, ...options: string[]): Chainable<void>
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

Cypress.Commands.add('visitWithoutRandomUUID', (url: string) => {
  cy.visit(url, {
    onBeforeLoad: (win) => {
      win.sessionStorage.clear()
      Object.defineProperty(win.crypto, 'randomUUID', { value: undefined, configurable: true })
    },
  })
  cy.window().its('crypto.randomUUID').should('be.undefined')
})

Cypress.Commands.add('openColumnFilter', (column: string) => {
  // antd duplicates headers in hidden measure cells when the table scrolls; .ant-table-thead holds the visible ones
  cy.contains('.ant-table-thead th', column).find('.ant-table-filter-trigger').click()
  return cy.get('.ant-table-filter-dropdown').filter(':visible').last()
})

Cypress.Commands.add('tableFilter', (column: string, ...options: string[]) => {
  cy.openColumnFilter(column).within(() => {
    options.forEach((option) => cy.contains('.ant-dropdown-menu-item', option).click())
    cy.contains('button', 'OK').click()
  })
})

Cypress.Commands.add('toast', (text: string | RegExp) => {
  cy.get('.ant-message').contains(text).should('be.visible')
})

// Real API: one token per user for the whole spec. The gateway limits logins per client address (Nginx
// limit_req, 30/min + burst 20 — checklist EXTRA-03); logging in before every call would hit that limit and turn
// the rest of the run into 429s. Each login is its own Redis session and a logout only closes its own session,
// so reusing the token is safe; a token that stops working (401) is replaced by a new login.
const TOKEN_MAX_AGE_MS = 10 * 60 * 1000 // the access token lives 15 min
const realTokens = new Map<string, { token: string; at: number }>()

function realLogin(email: string, password: string): Cypress.Chainable<string> {
  return cy.request({ method: 'POST', url: '/api/auth/login', body: { email, password }, log: false }).then((res) => {
    realTokens.set(email, { token: res.body.token, at: Date.now() })
    return res.body.token as string
  })
}

function realToken(email: string, password = PASSWORD): Cypress.Chainable<string> {
  const cached = realTokens.get(email)
  if (cached && Date.now() - cached.at < TOKEN_MAX_AGE_MS) return cy.wrap(cached.token, { log: false })
  return realLogin(email, password)
}

Cypress.Commands.add('apiAs', (email: string, method: string, path: string, body?: unknown) => {
  // Real-API suite (cypress.api.config.ts sets REAL_API): plain HTTP through the frontend's /api proxy.
  if (Cypress.env('REAL_API')) {
    const call = (token: string) =>
      cy.request({
        method,
        url: `/api${path}`,
        body: body as Cypress.RequestBody,
        headers: { Authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      })
    return realToken(email)
      .then((token) => call(token))
      .then((res) => (res.status === 401 ? realLogin(email, PASSWORD).then(call) : cy.wrap(res, { log: false })))
      .then((res) => ({ status: res.status, json: res.body }))
  }
  // Fake-backend suite: the hook lives in the app page — load it first when the test has not visited anything yet
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

// ---------- low-level API access (checklist specs) ----------

/** The page that hosts the fake backend (or the /api proxy of the real stack) must be loaded first. */
function appWindow() {
  cy.window().then((win) => {
    const onApp = win.location.origin === new URL(Cypress.config('baseUrl') ?? win.location.origin).origin
    const hookReady = Cypress.env('REAL_API') || '__mockBackend' in win
    if (!onApp || !hookReady) cy.visit('/login')
  })
  return cy.window()
}

function mockCall(win: Cypress.AUTWindow, req: ApiRequest) {
  const handle = (win as unknown as { __mockBackend?: { handle: MockHandle } }).__mockBackend?.handle
  if (!handle) throw new Error('mock backend hook not found — is VITE_MOCK_BACKEND enabled?')
  const [pathname, qs = ''] = req.path.split('?')
  return handle({
    method: req.method,
    path: pathname,
    query: new win.URLSearchParams(qs),
    body: req.body,
    headers: {
      'Content-Type': 'application/json',
      ...(req.token ? { Authorization: `Bearer ${req.token}` } : {}),
      ...req.headers,
    },
  }).then((res): ApiResult => ({ status: res.status, json: res.json, headers: null }))
}

function realHeaders(req: ApiRequest): Record<string, string> {
  return { ...(req.token ? { Authorization: `Bearer ${req.token}` } : {}), ...req.headers }
}

Cypress.Commands.add('apiToken', (email: string, password = PASSWORD) => {
  if (Cypress.env('REAL_API')) return realToken(email, password)
  return appWindow().then((win) =>
    mockCall(win, { method: 'POST', path: '/auth/login', body: { email, password } }).then((res) => {
      if (res.status !== 200) throw new Error(`login of ${email} failed: ${res.status}`)
      return res.json.token as string
    }),
  )
})

Cypress.Commands.add('apiCall', (req: ApiRequest) => {
  if (Cypress.env('REAL_API')) {
    return cy
      .request({
        method: req.method,
        url: `/api${req.path}`,
        body: req.body as Cypress.RequestBody,
        headers: realHeaders(req),
        failOnStatusCode: false,
      })
      .then((res): ApiResult => ({
        status: res.status,
        json: res.body,
        headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
      }))
  }
  return appWindow().then((win) => mockCall(win, req))
})

Cypress.Commands.add('apiParallel', (reqs: ApiRequest[]) => {
  return appWindow().then((win) => {
    if (!Cypress.env('REAL_API')) return Promise.all(reqs.map((req) => mockCall(win, req)))
    // real stack: true concurrency — the browser sends every request before any answer arrives
    return Promise.all(
      reqs.map((req) =>
        win
          .fetch(`/api${req.path}`, {
            method: req.method,
            headers: { 'Content-Type': 'application/json', ...realHeaders(req) },
            body: req.body === undefined ? undefined : JSON.stringify(req.body),
          })
          .then(async (res): Promise<ApiResult> => {
            const text = await res.text()
            const headers: Record<string, string> = {}
            res.headers.forEach((value, key) => (headers[key.toLowerCase()] = value))
            return { status: res.status, json: text ? JSON.parse(text) : {}, headers }
          }),
      ),
    )
  })
})
