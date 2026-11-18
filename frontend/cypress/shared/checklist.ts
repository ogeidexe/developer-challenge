// Automated part of the manual test catalog (driven-tests/): one Cypress test per catalog item, its title
// starting with the catalog id ("[REQ-01] …"). `cypress/checklist-runner.mjs` reads those ids from the results
// and writes a session file the checklist page imports (format dt-pleno-v1).
//
// The SAME tests run in both suites:
//   - cypress/e2e/10-checklist.cy.ts      → in-browser fake backend (fresh seed in every test)
//   - cypress/e2e-api/04-checklist.cy.ts  → real stack (docker compose); the database is NOT reset
// So every test that writes data does it in its own SANDBOX (a new cost center with its own requester and
// approvers); the seed is only read, never changed. A second run on the same database still passes.
import { PASSWORD, USERS, type ApiResult } from '../support/commands'

type Json = ApiResult['json']
type Res = { status: number; json: Json }

const REAL = () => Boolean(Cypress.env('REAL_API'))
const RUN = Date.now().toString(36).toUpperCase()
let seq = 0
const uniq = () => `${RUN}${(seq++).toString(36).toUpperCase()}`

/** Business calendar: dates in America/Sao_Paulo (README §2.3 rule 5). */
const spToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
const spMonth = () => spToday().slice(0, 7)
const cents = (money: string) => Math.round(Number(money) * 100)

/** Asserts the status and yields the body; the message carries the body, so a failure explains itself. */
const ok = (res: Res, status: number, what: string): Json => {
  expect(res.status, `${what} → ${JSON.stringify(res.json).slice(0, 400)}`).to.eq(status)
  return res.json
}
const refused = (res: Res, status: number, code: string, what: string): Json => {
  expect(res.status, `${what} → ${JSON.stringify(res.json).slice(0, 400)}`).to.eq(status)
  expect(res.json.code, `${what}: code`).to.eq(code)
  return res.json
}

const item = (unitPrice: string, quantity = 1, description = 'Item do checklist') => ({
  description,
  quantity,
  unitPrice,
})
const levels = (r: Json): string[] => r.steps.map((s: Json) => s.level)

// ---------- API helpers (fake or real backend, via cy.apiAs) ----------

const create = (owner: string, body: object) =>
  cy.apiAs(owner, 'POST', '/requests', body).then((res) => ok(res, 201, 'create request'))

const submit = (owner: string, r: Json) =>
  cy
    .apiAs(owner, 'POST', `/requests/${r.id}/submit`, { lockVersion: r.lockVersion })
    .then((res) => ok(res, 200, 'submit'))

const createSubmitted = (owner: string, body: object) => create(owner, body).then((r) => submit(owner, r))

/** A request waiting at its N1 step (R$ 500,00 → chain [NIVEL_1]); `costCenterId` defaults to the owner's. */
const pending = (owner: string, label: string, costCenterId?: string) =>
  createSubmitted(owner, { title: `${label} ${uniq()}`, category: 'OTHER', costCenterId, items: [item('500.00')] })

const decide = (user: string, r: Json, action: 'approve' | 'reject' | 'request-changes', comment?: string) =>
  cy.apiAs(user, 'POST', `/requests/${r.id}/${action}`, { lockVersion: r.lockVersion, comment })

const detail = (user: string, id: string) =>
  cy.apiAs(user, 'GET', `/requests/${id}`).then((res) => ok(res, 200, 'detail'))

const edit = (owner: string, r: Json, items: object[]) =>
  cy
    .apiAs(owner, 'PUT', `/requests/${r.id}`, {
      title: r.title,
      category: r.category,
      costCenterId: r.costCenter.id,
      items,
      lockVersion: r.lockVersion,
    })
    .then((res) => ok(res, 200, 'edit'))

const budget = (costCenterId: string, month = spMonth()) =>
  cy.apiAs(USERS.admin1, 'GET', `/cost-centers/${costCenterId}/budgets/${month}`).then((res) => ok(res, 200, 'budget'))

const inboxIds = (user: string, costCenterId?: string) =>
  cy
    .apiAs(user, 'GET', `/approvals/inbox?size=100${costCenterId ? `&costCenterId=${costCenterId}` : ''}`)
    .then((res) => ok(res, 200, 'inbox').data.map((x: Json) => x.id as string))

const history = (user: string, id: string) =>
  cy.apiAs(user, 'GET', `/requests/${id}/history`).then((res): Json => ok(res, 200, 'history'))

const costCenterId = (code: string) =>
  cy
    .apiAs(USERS.admin1, 'GET', '/cost-centers')
    .then((res) => ok(res, 200, 'cost centers').find((c: Json) => c.code === code).id as string)

// ---------- sandbox: an isolated cost center per run (real API) or per test (fake backend) ----------

interface Sandbox {
  ccId: string
  ccCode: string
  requester: string
  n1: string
  n1b: string
  n2: string
}
let cached: Sandbox | null = null

interface NewCostCenter {
  id: string
  code: string
}

/** A new cost center; with `budgetAmount`, also its budget for the current month. */
const newCostCenter = (budgetAmount?: string): Cypress.Chainable<NewCostCenter> => {
  const code = `CY-${uniq()}`
  return cy.apiAs(USERS.admin1, 'POST', '/cost-centers', { code, name: `Checklist Cypress ${code}` }).then((res) => {
    const cc: NewCostCenter = { id: ok(res, 201, 'create cost center').id, code }
    if (budgetAmount) {
      cy.apiAs(USERS.admin1, 'PUT', `/cost-centers/${cc.id}/budgets/${spMonth()}`, { amount: budgetAmount }).then((b) =>
        ok(b, 200, 'set budget'),
      )
    }
    return cy.wrap(cc, { log: false })
  })
}

const newUser = (email: string, name: string, role: string, ccId: string, approverLevel?: string) =>
  cy
    .apiAs(USERS.admin1, 'POST', '/users', { email, password: PASSWORD, name, role, approverLevel, costCenterId: ccId })
    .then((res) => ok(res, 201, `create user ${email}`))

/** A new cost center (budget R$ 1.000.000,00 this month) with a requester, two N1 and one N2 approver. */
function sandbox(): Cypress.Chainable<Sandbox> {
  if (REAL() && cached) return cy.wrap(cached, { log: false })
  return newCostCenter('1000000.00').then((cc) => {
    const base = cc.code.toLowerCase()
    const sb: Sandbox = {
      ccId: cc.id,
      ccCode: cc.code,
      requester: `${base}.solic@kingspan.test`,
      n1: `${base}.n1@kingspan.test`,
      n1b: `${base}.n1b@kingspan.test`,
      n2: `${base}.n2@kingspan.test`,
    }
    newUser(sb.requester, 'Cypress Solicitante', 'SOLICITANTE', cc.id)
    newUser(sb.n1, 'Cypress Aprovador Um', 'APROVADOR', cc.id, 'NIVEL_1')
    newUser(sb.n1b, 'Cypress Aprovador Outro', 'APROVADOR', cc.id, 'NIVEL_1')
    newUser(sb.n2, 'Cypress Aprovador Dois', 'APROVADOR', cc.id, 'NIVEL_2')
    return cy.then(() => {
      if (REAL()) cached = sb
      return sb
    })
  })
}

// ---------- UI helpers ----------

const stat = (title: string) => cy.contains('.ant-statistic', title).find('.ant-statistic-content-value')
const signOutFromMenu = (name: string) => {
  cy.get('.ant-layout-header').contains('button', name).click()
  cy.get('.ant-dropdown-menu').contains('Sair').click()
  cy.location('pathname').should('eq', '/login')
}
const signInOnForm = (email: string) => {
  cy.get('#login_email').clear().type(email)
  cy.get('#login_password').clear().type(PASSWORD, { log: false })
  cy.contains('button', /^Entrar$/).click()
}
/** Records, on every DOM change, whether `seen(document)` was ever true — catches content that shows for a few ms. */
const watchDom = (flag: string, seen: (doc: Document) => boolean) =>
  cy.window().then((win) => {
    const w = win as unknown as Record<string, unknown>
    w[flag] = false
    new win.MutationObserver(() => {
      if (seen(win.document)) w[flag] = true
    }).observe(win.document.body, { subtree: true, childList: true, characterData: true })
  })

// =====================================================================================================

export function checklistSuite() {
  describe('Checklist (driven-tests) — automated catalog items', () => {
    // ---------------- AUTH ----------------

    it('[AUTH-03] GET /auth/me returns the signed-in user without password or hash', () => {
      cy.apiAs(USERS.solicTi, 'GET', '/auth/me').then((res) => {
        const me = ok(res, 200, 'GET /auth/me')
        expect(me).to.include.keys('id', 'email', 'name', 'role', 'costCenterId')
        expect(me.email).to.eq(USERS.solicTi)
        expect(me.role).to.eq('SOLICITANTE')
        expect(
          Object.keys(me).filter((k) => /pass|hash/i.test(k)),
          'password/hash fields',
        ).to.be.empty
        expect(JSON.stringify(me), 'no bcrypt hash anywhere').not.to.match(/\$2[aby]\$/)
      })
    })

    it('[AUTH-08] a role change applies on the next request, even with the old token', () => {
      sandbox().then((sb) => {
        const email = `cy.promovido.${uniq().toLowerCase()}@kingspan.test`
        newUser(email, 'Cypress Promovido', 'SOLICITANTE', sb.ccId).then((user) => {
          cy.apiToken(email).then((token) => {
            cy.apiCall({ method: 'GET', path: '/approvals/inbox', token }).then((r) =>
              refused(r, 403, 'FORBIDDEN', 'inbox before promotion'),
            )
            cy.apiAs(USERS.admin1, 'PATCH', `/users/${user.id}`, {
              role: 'APROVADOR',
              approverLevel: 'NIVEL_1',
              lockVersion: user.lockVersion,
            }).then((r) => ok(r, 200, 'promote to APROVADOR'))
            cy.apiCall({ method: 'GET', path: '/approvals/inbox', token }).then((r) =>
              ok(r, 200, 'inbox with the OLD token after promotion'),
            )
          })
        })
      })
    })

    // ---------------- REQ ----------------

    it('[REQ-01] a new request is a DRAFT and the total is computed by the backend (client total ignored)', () => {
      sandbox().then((sb) => {
        cy.apiAs(sb.requester, 'POST', '/requests', {
          title: `Total no servidor ${uniq()}`,
          category: 'EQUIPMENT',
          items: [item('4899.90', 5)],
          total: '1.00',
        }).then((res) => {
          const r = ok(res, 201, 'create with a fake total')
          expect(r.status).to.eq('DRAFT')
          expect(r.total).to.eq('24499.50')
          cy.login(sb.requester)
          cy.visit(`/requests/${r.id}`)
          cy.contains('24.499,50') // the screen shows the server total
        })
      })
    })

    it('[REQ-02] invalid fields answer 400 VALIDATION_FAILED with one error per field', () => {
      cy.apiAs(USERS.solicTi, 'POST', '/requests', {
        title: '',
        category: 'EQUIPMENT',
        items: [{ description: 'Item', quantity: 0, unitPrice: '-1' }],
      }).then((res) => {
        const p = refused(res, 400, 'VALIDATION_FAILED', 'empty title, quantity 0, negative price')
        expect(p.errors.map((e: Json) => e.field)).to.include.members([
          'title',
          'items[0].quantity',
          'items[0].unitPrice',
        ])
      })
      cy.apiAs(USERS.solicTi, 'POST', '/requests', {
        title: 'Necessidade para hoje',
        category: 'EQUIPMENT',
        neededBy: spToday(),
        items: [item('10.00')],
      }).then((res) => {
        const p = refused(res, 400, 'VALIDATION_FAILED', 'neededBy = today')
        expect(p.errors.map((e: Json) => e.field)).to.include('neededBy')
      })
    })

    it("[REQ-03] category must be in the enum; the cost center defaults to the requester's", () => {
      sandbox().then((sb) => {
        create(sb.requester, { title: `Sem centro ${uniq()}`, category: 'OTHER', items: [item('10.00')] }).then((r) =>
          expect(r.costCenter.code).to.eq(sb.ccCode),
        )
        cy.apiAs(sb.requester, 'POST', '/requests', {
          title: 'Categoria inválida',
          category: 'FOOD',
          items: [item('10.00')],
        }).then((res) => expect(res.status, 'category FOOD').to.eq(400))
      })
    })

    it('[REQ-04] only the owner edits, and only in DRAFT or CHANGES_REQUESTED', () => {
      sandbox().then((sb) => {
        create(sb.requester, { title: `Rascunho editável ${uniq()}`, category: 'OTHER', items: [item('10.00')] })
          .then((d) => edit(sb.requester, d, [item('12.00')]))
          .then((e) => expect(e.total).to.eq('12.00'))
      })
      sandbox().then((sb) =>
        pending(sb.requester, 'Pendente não editável').then((p) => {
          expect(p.allowedActions).not.to.include('EDIT')
          const body = { title: p.title, category: p.category, items: [item('900.00')], lockVersion: p.lockVersion }
          cy.apiAs(sb.requester, 'PUT', `/requests/${p.id}`, body).then((r) =>
            refused(r, 422, 'INVALID_TRANSITION', 'owner edits a pending request'),
          )
          cy.apiAs(sb.n1, 'PUT', `/requests/${p.id}`, body).then((r) =>
            refused(r, 403, 'NOT_REQUEST_OWNER', 'approver (sees it, not the owner) edits'),
          )
        }),
      )
    })

    // ---------------- LIST ----------------

    it('[LIST-01] pagination envelope, server-side sort, invalid sort is 400 and size is capped at 100', () => {
      cy.apiAs(USERS.admin1, 'GET', '/requests?page=0&size=2&sort=total,desc').then((res) => {
        const page = ok(res, 200, 'page 0, size 2, by total desc')
        expect(page).to.include.all.keys('data', 'page', 'size', 'totalElements', 'totalPages')
        expect(page.page).to.eq(0)
        expect(page.size).to.eq(2)
        expect(page.data.length).to.be.at.most(2)
        const totals = page.data.map((x: Json) => cents(x.total))
        expect(totals).to.deep.eq([...totals].sort((a, b) => b - a))
      })
      cy.apiAs(USERS.admin1, 'GET', '/requests?sort=password,asc').then((r) =>
        refused(r, 400, 'INVALID_SORT', 'sort by password'),
      )
      cy.apiAs(USERS.admin1, 'GET', '/requests?size=1000').then((r) => expect(ok(r, 200, 'size 1000').size).to.eq(100))
    })

    it('[LIST-02] the API combines the README filters (status, category, costCenterId, createdFrom, createdTo)', () => {
      cy.apiAs(USERS.admin1, 'GET', '/requests?size=100&status=PENDING_APPROVAL&category=SOFTWARE').then((res) =>
        ok(res, 200, 'status + category').data.forEach((x: Json) => {
          expect(x.status).to.eq('PENDING_APPROVAL')
          expect(x.category).to.eq('SOFTWARE')
        }),
      )
      costCenterId('CC-TI-01').then((ti) =>
        cy.apiAs(USERS.admin1, 'GET', `/requests?size=100&costCenterId=${ti}`).then((res) => {
          const data = ok(res, 200, 'costCenterId').data
          expect(data).not.to.be.empty
          data.forEach((x: Json) => expect(x.costCenter.code).to.eq('CC-TI-01'))
        }),
      )
      cy.apiAs(USERS.admin1, 'GET', '/requests?createdFrom=2000-01-01&createdTo=2000-01-31').then((res) =>
        expect(ok(res, 200, 'createdFrom/createdTo in 2000').totalElements).to.eq(0),
      )
      cy.apiAs(USERS.admin1, 'GET', `/requests?createdFrom=2000-01-01&createdTo=${spToday()}`).then((res) =>
        expect(ok(res, 200, 'createdFrom 2000 → today').totalElements).to.be.greaterThan(0),
      )
    })

    it('[LIST-03] visibility by role: own (SOLICITANTE), own cost center (APROVADOR), all but foreign drafts (ADMIN)', () => {
      const check = (email: string, rule: (r: Json, meId: string) => boolean, label: string) =>
        cy.apiAs(email, 'GET', '/auth/me').then((me) =>
          cy.apiAs(email, 'GET', '/requests?size=100').then((res) => {
            const data = ok(res, 200, `list as ${email}`).data
            expect(data, `${email} sees something`).not.to.be.empty
            data.forEach((r: Json) => expect(rule(r, me.json.id), `${label}: ${r.title}`).to.eq(true))
          }),
        )
      check(USERS.solicTi, (r, me) => r.owner.id === me, 'SOLICITANTE sees only own requests')
      check(
        USERS.aprov1Ti,
        (r, me) => r.owner.id === me || (r.costCenter.code === 'CC-TI-01' && r.status !== 'DRAFT'),
        'APROVADOR sees own + non-draft requests of CC-TI-01',
      )
      check(USERS.admin1, (r, me) => r.owner.id === me || r.status !== 'DRAFT', 'ADMIN never sees foreign drafts')
    })

    it('[LIST-04] a draft is visible to its owner only — not even to ADMIN (list, API and page by id)', () => {
      const title = 'Monitores para o time de suporte'
      cy.requestIdByTitle(USERS.solicTi, title).then((id) => {
        cy.apiAs(USERS.admin1, 'GET', `/requests?size=100&q=${encodeURIComponent(title)}`).then((res) =>
          expect(ok(res, 200, 'admin list').data, 'draft in the admin list').to.have.length(0),
        )
        cy.apiAs(USERS.admin1, 'GET', `/requests/${id}`).then((r) =>
          refused(r, 404, 'NOT_FOUND', 'admin opens the draft'),
        )
        cy.login(USERS.admin1)
        cy.visit(`/requests/${id}`)
        cy.contains('Solicitação não encontrada')
      })
    })

    it('[LIST-04] switching user without a page reload never shows the previous user’s list (residual data)', () => {
      const draft = 'Monitores para o time de suporte' // solic.ti's draft: must never reach the admin's screen
      cy.login(USERS.solicTi)
      cy.visit(`/requests?q=${encodeURIComponent(draft)}`)
      cy.contains('.ant-table-row', draft)
      signOutFromMenu('Sofia Lima')
      watchDom('__residualList', (doc) => (doc.body.textContent ?? '').includes(draft))
      // back to the same list URL (returnUrl) in the same page — no reload, so the same query cache
      signInOnForm(USERS.admin1)
      cy.location('pathname').should('eq', '/requests')
      cy.contains('Nenhuma solicitação encontrada com esses filtros') // the admin's (empty) answer has arrived
      cy.window()
        .its('__residualList')
        .should((seen) =>
          expect(seen, 'the previous user’s draft showed up on the admin’s list (stale query cache)').to.eq(false),
        )
    })

    it('[LIST-05] a request outside the visibility answers 404 without revealing it exists', () => {
      cy.requestIdByTitle(USERS.solicAdm, 'Notebooks para o time de TI').then((id) =>
        cy.apiAs(USERS.aprov1Ti, 'GET', `/requests/${id}`).then((r) => {
          refused(r, 404, 'NOT_FOUND', 'CC-TI-01 approver opens a CC-ADM-02 request')
          expect(JSON.stringify(r.json)).not.to.contain('Notebooks')
        }),
      )
    })

    // ---------------- CHAIN ----------------

    it('[CHAIN-01] chain by value at the exact limits: 1.000,00 / 1.000,01 / 10.000,01', () => {
      sandbox().then((sb) => {
        const chainOf = (total: string) =>
          createSubmitted(sb.requester, {
            title: `Limite ${total} ${uniq()}`,
            category: 'EQUIPMENT',
            items: [item(total)],
          }).then(levels)
        chainOf('1000.00').should('deep.eq', ['NIVEL_1'])
        chainOf('1000.01').should('deep.eq', ['NIVEL_1', 'NIVEL_2'])
        chainOf('10000.01').should('deep.eq', ['NIVEL_1', 'NIVEL_2', 'ADMIN'])
      })
    })

    it('[CHAIN-02] SOFTWARE always ends with a single ADMIN step', () => {
      sandbox().then((sb) => {
        const chainOf = (total: string) =>
          createSubmitted(sb.requester, {
            title: `Software ${total} ${uniq()}`,
            category: 'SOFTWARE',
            items: [item(total)],
          }).then(levels)
        chainOf('300.00').should('deep.eq', ['NIVEL_1', 'ADMIN'])
        chainOf('50000.00').should('deep.eq', ['NIVEL_1', 'NIVEL_2', 'ADMIN'])
      })
    })

    // ---------------- FLOW + BUDGET-02 ----------------

    it('[FLOW-01][BUDGET-02] N1 → N2 → ADMIN → APPROVED; only the final step consumes, in the competence month', () => {
      sandbox().then((sb) => {
        budget(sb.ccId).then((before) => {
          const consumed = () => budget(sb.ccId).then((b) => cents(b.consumed) - cents(before.consumed))
          createSubmitted(sb.requester, {
            title: `Fluxo completo ${uniq()}`,
            category: 'EQUIPMENT',
            items: [item('12000.00')],
          }).then((r0) => {
            expect(levels(r0)).to.deep.eq(['NIVEL_1', 'NIVEL_2', 'ADMIN'])
            expect(r0.competenceMonth, 'competence = month of this submission (São Paulo)').to.eq(spMonth())
            decide(sb.n1, r0, 'approve').then((a) => {
              const r1 = ok(a, 200, 'N1 approves')
              expect(r1.status).to.eq('PENDING_APPROVAL')
              consumed().should('eq', 0)
              decide(sb.n2, r1, 'approve').then((b) => {
                const r2 = ok(b, 200, 'N2 approves')
                consumed().should('eq', 0)
                decide(USERS.admin1, r2, 'approve').then((c) => {
                  const r3 = ok(c, 200, 'ADMIN approves')
                  expect(r3.status).to.eq('APPROVED')
                  expect(r3.steps.map((s: Json) => s.status)).to.deep.eq(['APPROVED', 'APPROVED', 'APPROVED'])
                  consumed().should('eq', cents('12000.00'))
                })
              })
            })
          })
        })
      })
    })

    it('[FLOW-02] who may approve each step: N1 on an N2 step is 422, a SOLICITANTE is 403', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.requester, {
          title: `Elegibilidade ${uniq()}`,
          category: 'EQUIPMENT',
          items: [item('5000.00')],
        })
          .then((r0) => decide(sb.n1, r0, 'approve'))
          .then((a) => {
            const r1 = ok(a, 200, 'N1 approves the N1 step')
            decide(sb.n1b, r1, 'approve').then((r) => {
              const p = refused(r, 422, 'APPROVER_NOT_ELIGIBLE', 'another N1 on the N2 step')
              expect(p.detail, 'explains who may approve').to.contain('NIVEL_2')
            })
            decide(sb.requester, r1, 'approve').then((r) => refused(r, 403, 'FORBIDDEN', 'SOLICITANTE approves'))
          })
      })
    })

    it('[FLOW-03] reject needs a 10+ character comment; then REJECTED and the later steps are closed', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.requester, {
          title: `Rejeição ${uniq()}`,
          category: 'EQUIPMENT',
          items: [item('5000.00')],
        }).then((r0) => {
          decide(sb.n1, r0, 'reject', 'curto').then((r) => refused(r, 422, 'COMMENT_REQUIRED', 'short comment'))
          decide(sb.n1, r0, 'reject', 'Fora do orçamento deste trimestre.').then((r) => {
            const rejected = ok(r, 200, 'reject with a valid comment')
            expect(rejected.status).to.eq('REJECTED')
            expect(rejected.steps.map((s: Json) => s.status)).to.deep.eq(['REJECTED', 'SKIPPED'])
          })
        })
      })
    })

    it('[FLOW-04] cancel by owner or ADMIN; final states refuse every action; budget consumed once', () => {
      sandbox().then((sb) => {
        create(sb.requester, { title: `Cancelar rascunho ${uniq()}`, category: 'OTHER', items: [item('50.00')] }).then(
          (d) =>
            cy
              .apiAs(sb.requester, 'POST', `/requests/${d.id}/cancel`, { lockVersion: d.lockVersion })
              .then((r) => expect(ok(r, 200, 'owner cancels a draft').status).to.eq('CANCELLED')),
        )
        createSubmitted(sb.requester, {
          title: `Cancelar pendente ${uniq()}`,
          category: 'OTHER',
          items: [item('60.00')],
        }).then((p) =>
          cy.apiAs(USERS.admin1, 'POST', `/requests/${p.id}/cancel`, { lockVersion: p.lockVersion }).then((r) => {
            const c = ok(r, 200, 'ADMIN cancels a pending request')
            expect(c.status).to.eq('CANCELLED')
            cy.apiAs(sb.requester, 'POST', `/requests/${c.id}/submit`, { lockVersion: c.lockVersion }).then((x) =>
              refused(x, 422, 'INVALID_TRANSITION', 'submit a CANCELLED request'),
            )
          }),
        )
        budget(sb.ccId).then((before) => {
          const consumed = () => budget(sb.ccId).then((b) => cents(b.consumed) - cents(before.consumed))
          createSubmitted(sb.requester, { title: `Final ${uniq()}`, category: 'OTHER', items: [item('300.00')] })
            .then((r0) => decide(sb.n1, r0, 'approve'))
            .then((a) => {
              const approved = ok(a, 200, 'final approval')
              expect(approved.status).to.eq('APPROVED')
              expect(approved.allowedActions).to.be.empty
              decide(USERS.admin1, approved, 'approve').then((r) =>
                refused(r, 422, 'INVALID_TRANSITION', 'approve an APPROVED request'),
              )
              cy.apiAs(sb.requester, 'POST', `/requests/${approved.id}/cancel`, {
                lockVersion: approved.lockVersion,
              }).then((r) => refused(r, 422, 'INVALID_TRANSITION', 'cancel an APPROVED request'))
              consumed().should('eq', cents('300.00')) // once, not twice
            })
        })
      })
    })

    it('[FLOW-05] check order 401 → 404 → 403 → 409 → 422, with a reason in the 422', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.requester, {
          title: `Ordem de erros ${uniq()}`,
          category: 'OTHER',
          items: [item('500.00')],
        }).then((r0) => {
          const stale = r0.lockVersion > 1 ? r0.lockVersion - 1 : r0.lockVersion + 1
          const path = `/requests/${r0.id}/reject`
          // every call below breaks ALL the later rules too (stale lockVersion, no comment)
          cy.apiCall({ method: 'POST', path, body: { lockVersion: stale } }).then((r) =>
            refused(r, 401, 'UNAUTHENTICATED', 'no token'),
          )
          cy.apiAs(USERS.aprov1Ti, 'POST', path, { lockVersion: stale }).then((r) =>
            refused(r, 404, 'NOT_FOUND', 'invisible to an approver of another cost center'),
          )
          cy.apiAs(sb.requester, 'POST', path, { lockVersion: stale }).then((r) =>
            expect(r.status, 'SOLICITANTE (wrong role) → 403 before 409/422').to.eq(403),
          )
          cy.apiAs(sb.n1, 'POST', path, { lockVersion: stale }).then((r) => {
            const p = refused(r, 409, 'CONCURRENCY_CONFLICT', 'eligible approver, stale lockVersion, no comment')
            expect(p.currentLockVersion).to.eq(r0.lockVersion)
          })
          cy.apiAs(sb.n1, 'POST', path, { lockVersion: r0.lockVersion }).then((r) => {
            const p = refused(r, 422, 'COMMENT_REQUIRED', 'current lockVersion, no comment')
            expect(p.detail)
              .to.match(/coment/i)
              .and.not.match(/ação inválida/i)
          })
        })
      })
    })

    it('[FLOW-06] a step nobody may approve stays pending (not an error): ADMIN step of an ADMIN-owned request', () => {
      sandbox().then((sb) => {
        createSubmitted(USERS.admin1, {
          title: `Sem aprovador elegível ${uniq()}`,
          category: 'EQUIPMENT',
          costCenterId: sb.ccId,
          items: [item('15000.00')],
        })
          .then((r0) => decide(sb.n1, r0, 'approve'))
          .then((a) => decide(sb.n2, ok(a, 200, 'N1'), 'approve'))
          .then((b) => {
            const atAdmin = ok(b, 200, 'N2')
            expect(atAdmin.status).to.eq('PENDING_APPROVAL')
            expect(atAdmin.steps[2]).to.include({ level: 'ADMIN', status: 'PENDING' })
            inboxIds(USERS.admin1, sb.ccId).should('not.include', atAdmin.id)
            inboxIds(USERS.admin2, sb.ccId).should('include', atAdmin.id)
            decide(USERS.admin1, atAdmin, 'approve').then((r) =>
              refused(r, 422, 'SELF_APPROVAL_FORBIDDEN', 'admin1 approves their own request'),
            )
            detail(USERS.admin1, atAdmin.id).its('status').should('eq', 'PENDING_APPROVAL')
          })
      })
    })

    // ---------------- SOD ----------------

    it('[SOD-01] nobody approves their own request (and the API offers no APPROVE to the owner)', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.n1, { title: `Própria ${uniq()}`, category: 'OTHER', items: [item('500.00')] }).then(
          (r0) => {
            expect(r0.allowedActions).not.to.include('APPROVE')
            decide(sb.n1, r0, 'approve').then((r) =>
              refused(r, 422, 'SELF_APPROVAL_FORBIDDEN', 'approver approves own'),
            )
          },
        )
      })
    })

    it('[SOD-02] the same person does not approve two steps of one version (and leaves their inbox)', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.requester, {
          title: `Duas etapas ${uniq()}`,
          category: 'EQUIPMENT',
          items: [item('5000.00')],
        })
          .then((r0) => decide(sb.n2, r0, 'approve'))
          .then((a) => {
            const r1 = ok(a, 200, 'NIVEL_2 approver approves the N1 step')
            decide(sb.n2, r1, 'approve').then((r) => {
              const p = refused(r, 422, 'DUPLICATE_APPROVER', 'same person on the N2 step')
              expect(p.detail, 'names the step already approved').to.contain('NIVEL_1')
            })
            inboxIds(sb.n2, sb.ccId).should('not.include', r1.id)
          })
      })
    })

    // ---------------- BUDGET ----------------

    it('[BUDGET-01] BUDGET_EXCEEDED keeps the request pending and the attempt is in the history', () => {
      // the seed's case (R$ 900,00 against R$ 800,00 left), rebuilt in a fresh cost center: no dependency on seed state
      sandbox().then((sb) =>
        newCostCenter('800.00').then((cc) =>
          createSubmitted(sb.requester, {
            title: `Acima do saldo ${uniq()}`,
            category: 'SUPPLIES',
            costCenterId: cc.id,
            items: [item('900.00')],
          }).then((r0) => {
            decide(USERS.admin1, r0, 'approve').then((r) => {
              const p = refused(r, 422, 'BUDGET_EXCEEDED', 'final approval above the balance')
              expect(p.detail, 'balance and amount in the message').to.match(/R\$/)
            })
            detail(USERS.admin1, r0.id).its('status').should('eq', 'PENDING_APPROVAL')
            budget(cc.id).its('consumed').should('eq', '0.00')
            history(USERS.admin1, r0.id).then((events: Json[]) =>
              expect(events.map((e) => e.action)).to.include('APPROVAL_FAILED_BUDGET'),
            )
          }),
        ),
      )
    })

    it('[BUDGET-03] a month without a budget reads as zero and a final approval there is BUDGET_EXCEEDED', () => {
      sandbox().then((sb) =>
        budget(sb.ccId, '1999-01').then((b) => {
          expect(b.amount).to.eq('0.00')
          expect(b.consumed).to.eq('0.00')
          expect(b.available).to.eq('0.00')
        }),
      )
      newCostCenter().then((empty) =>
        sandbox().then((sb) =>
          createSubmitted(sb.requester, {
            title: `Mês sem orçamento ${uniq()}`,
            category: 'OTHER',
            costCenterId: empty.id,
            items: [item('100.00')],
          }).then((r0) =>
            decide(USERS.admin1, r0, 'approve').then((r) =>
              refused(r, 422, 'BUDGET_EXCEEDED', 'final approval in a center without a budget this month'),
            ),
          ),
        ),
      )
    })

    it('[BUDGET-04] budget PUT: ADMIN only, never below the consumed amount, month validated', () => {
      costCenterId('CC-TI-01').then((ti) =>
        cy
          .apiAs(USERS.admin1, 'PUT', `/cost-centers/${ti}/budgets/${spMonth()}`, { amount: '40000.00' })
          .then((r) => refused(r, 422, 'BUDGET_BELOW_CONSUMED', 'CC-TI-01 to 40.000,00 (consumed 49.200,00)')),
      )
      sandbox().then((sb) => {
        budget(sb.ccId).then((before) => {
          createSubmitted(sb.requester, { title: `Consumo ${uniq()}`, category: 'OTHER', items: [item('400.00')] })
            .then((r0) => decide(sb.n1, r0, 'approve'))
            .then((a) => expect(ok(a, 200, 'approve').status).to.eq('APPROVED'))
          const url = `/cost-centers/${sb.ccId}/budgets`
          cy.apiAs(USERS.admin1, 'PUT', `${url}/${spMonth()}`, { amount: '100.00' }).then((r) =>
            refused(r, 422, 'BUDGET_BELOW_CONSUMED', 'below the consumed amount'),
          )
          cy.apiAs(sb.requester, 'PUT', `${url}/${spMonth()}`, { amount: '2000000.00' }).then((r) =>
            expect(r.status, 'non-admin PUT').to.eq(403),
          )
          cy.apiAs(USERS.admin1, 'PUT', `${url}/2026-13`, { amount: '100.00' }).then((r) =>
            expect(r.status, 'month 2026-13').to.eq(400),
          )
          budget(sb.ccId).its('amount').should('eq', before.amount) // nothing above changed the amount
        })
      })
    })

    // ---------------- VER ----------------

    it('[VER-01] return → edit → resubmit creates v2 with a new chain; v1 stays immutable and readable', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.requester, {
          title: `Versões ${uniq()}`,
          category: 'EQUIPMENT',
          items: [item('100.00', 40, 'Licença')],
        })
          .then((v1) => decide(sb.n1, v1, 'request-changes', 'Reduzir para 35 licenças, por favor.'))
          .then((r) => {
            const returned = ok(r, 200, 'request changes')
            expect(returned.status).to.eq('CHANGES_REQUESTED')
            return edit(sb.requester, returned, [item('100.00', 35, 'Licença')])
          })
          .then((edited) => submit(sb.requester, edited))
          .then((v2) => {
            expect(v2.currentVersion).to.eq(2)
            expect(v2.status).to.eq('PENDING_APPROVAL')
            expect(
              v2.steps.map((s: Json) => s.status),
              'fresh chain',
            ).to.deep.eq(['PENDING', 'PENDING'])
            cy.apiAs(sb.requester, 'GET', `/requests/${v2.id}/versions`).then((res) =>
              expect(ok(res, 200, 'versions')).to.have.length(2),
            )
            cy.apiAs(sb.requester, 'GET', `/requests/${v2.id}/versions/1`).then((res) => {
              const v1 = ok(res, 200, 'version 1')
              expect(v1.items[0].quantity).to.eq(40)
              expect(v1.total).to.eq('4000.00')
            })
            cy.apiAs(sb.requester, 'GET', `/requests/${v2.id}/versions/2`).then((res) =>
              expect(ok(res, 200, 'version 2').items[0].quantity).to.eq(35),
            )
          })
      })
    })

    it('[VER-02] the chain is rebuilt from zero; approvals of v1 do not count', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.requester, { title: `Recalcula ${uniq()}`, category: 'EQUIPMENT', items: [item('5000.00')] })
          .then((r0) => decide(sb.n1, r0, 'approve'))
          .then((a) =>
            decide(sb.n2, ok(a, 200, 'N1 approves v1'), 'request-changes', 'Reduza para caber no orçamento.'),
          )
          .then((r) => edit(sb.requester, ok(r, 200, 'N2 returns'), [item('500.00')]))
          .then((edited) => submit(sb.requester, edited))
          .then((v2) => {
            expect(levels(v2)).to.deep.eq(['NIVEL_1'])
            expect(v2.steps[0].status).to.eq('PENDING')
            decide(sb.n1, v2, 'approve').then((r) =>
              expect(ok(r, 200, 'the v1 N1 approver approves v2').status).to.eq('APPROVED'),
            )
          })
      })
    })

    it('[VER-03] lockVersion changes on every write; the version (v1, v2…) only on (re)submission', () => {
      sandbox().then((sb) => {
        const seen: { lock: number; version: number }[] = []
        const track = (r: Json) => {
          seen.push({ lock: r.lockVersion, version: r.currentVersion })
          return r
        }
        create(sb.requester, { title: `Lock × versão ${uniq()}`, category: 'EQUIPMENT', items: [item('2000.00')] })
          .then(track)
          .then((d) => edit(sb.requester, d, [item('2500.00')]))
          .then(track)
          .then((e) => submit(sb.requester, e))
          .then(track)
          .then((s) => decide(sb.n1, s, 'request-changes', 'Detalhar melhor os itens pedidos.'))
          .then((r) => track(ok(r, 200, 'request changes')))
          .then((c) => edit(sb.requester, c, [item('2400.00')]))
          .then(track)
          .then((e2) => submit(sb.requester, e2))
          .then(track)
          .then(() => {
            const locks = seen.map((s) => s.lock)
            locks
              .slice(1)
              .forEach((lock, i) => expect(lock, `lockVersion after write ${i + 1}`).to.be.greaterThan(locks[i]))
            expect(seen.map((s) => s.version)).to.deep.eq([0, 0, 1, 1, 1, 2])
          })
      })
    })

    // ---------------- INBOX ----------------

    it('[INBOX-01] the inbox lists only what the user may approve now (level + cost center)', () => {
      sandbox().then((sb) =>
        pending(sb.requester, 'Na etapa N1').then((atN1) =>
          createSubmitted(sb.requester, {
            title: `Na etapa N2 ${uniq()}`,
            category: 'EQUIPMENT',
            items: [item('5000.00')],
          })
            .then((r0) => decide(sb.n1, r0, 'approve'))
            .then((a) => {
              const atN2 = ok(a, 200, 'N1 approves')
              // an N1 approver who decided nothing: the N1 step yes, the N2 step no (level)
              inboxIds(sb.n1b, sb.ccId).should('include', atN1.id).and('not.include', atN2.id)
              // an N2 approver: both (N2 may also approve N1 steps)
              inboxIds(sb.n2, sb.ccId).should('include', atN1.id).and('include', atN2.id)
            }),
        ),
      )
    })

    it('[INBOX-02] the inbox applies the cost center; a SOLICITANTE has no inbox (403)', () => {
      sandbox().then((sb) =>
        newCostCenter().then((other) =>
          pending(sb.requester, 'Em outro centro', other.id).then((elsewhere) => {
            cy.apiAs(sb.n1, 'GET', '/approvals/inbox?size=100').then((r) => {
              const data = ok(r, 200, 'inbox').data
              expect(data.map((x: Json) => x.id)).not.to.include(elsewhere.id)
              data.forEach((x: Json) => expect(x.costCenter.code).to.eq(sb.ccCode))
            })
          }),
        ),
      )
      cy.apiAs(USERS.solicTi, 'GET', '/approvals/inbox').then((r) => refused(r, 403, 'FORBIDDEN', 'SOLICITANTE inbox'))
    })

    // ---------------- HIST ----------------

    it('[HIST-01] every action creates an event with all README §2.5 fields, in order, in UTC', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.requester, { title: `Histórico ${uniq()}`, category: 'OTHER', items: [item('500.00')] })
          .then((r0) => decide(sb.n1, r0, 'approve', 'Aprovado pelo checklist.'))
          .then((a) => history(sb.requester, ok(a, 200, 'approve').id))
          .then((events: Json[]) => {
            expect(events.map((e) => e.action)).to.deep.eq(['REQUEST_CREATED', 'SUBMITTED', 'APPROVED'])
            events.forEach((e) => {
              expect(e).to.include.keys(
                'actor',
                'actorRole',
                'action',
                'toStatus',
                'versionNumber',
                'xRequestId',
                'occurredAt',
              )
              expect(e.occurredAt, 'UTC timestamp').to.match(/Z$/)
            })
            const times = events.map((e) => Date.parse(e.occurredAt))
            expect(times).to.deep.eq([...times].sort((x, y) => x - y))
            const approved = events[2]
            expect(approved.actorRole).to.eq('APROVADOR')
            expect(approved).to.include({
              fromStatus: 'PENDING_APPROVAL',
              toStatus: 'APPROVED',
              stepLevel: 'NIVEL_1',
              stepSequence: 1,
              versionNumber: 1,
              comment: 'Aprovado pelo checklist.',
            })
            expect(approved.xRequestId).to.be.a('string').and.not.be.empty
          })
      })
    })

    it('[HIST-02] the X-Request-Id of the request is stored in its event (and echoed by the API)', () => {
      const requestId = `teste-avaliador-${uniq().toLowerCase()}`
      sandbox().then((sb) => {
        create(sb.requester, { title: `Correlação ${uniq()}`, category: 'OTHER', items: [item('20.00')] }).then((d) =>
          cy.apiToken(sb.requester).then((token) =>
            cy
              .apiCall({
                method: 'POST',
                path: `/requests/${d.id}/submit`,
                body: { lockVersion: d.lockVersion },
                token,
                headers: { 'X-Request-Id': requestId },
              })
              .then((res) => {
                ok(res, 200, 'submit with X-Request-Id')
                if (res.headers) expect(res.headers['x-request-id'], 'echoed header').to.eq(requestId)
                history(sb.requester, d.id).then((events: Json[]) =>
                  expect(events.find((e) => e.action === 'SUBMITTED')?.xRequestId).to.eq(requestId),
                )
              }),
          ),
        )
      })
    })

    // ---------------- DASH ----------------

    it('[DASH-01] dashboard totals use the same visibility as the list, for each role', () => {
      ;[USERS.admin1, USERS.aprov1Ti, USERS.solicTi].forEach((email) =>
        cy.apiAs(email, 'GET', '/dashboard/summary').then((d) => {
          const totals = ok(d, 200, `dashboard as ${email}`).totals as Json[]
          const sum = totals.reduce((acc, t) => acc + t.count, 0)
          cy.apiAs(email, 'GET', '/requests?size=1').then((l) =>
            expect(sum, `${email}: dashboard total = visible requests`).to.eq(ok(l, 200, 'list').totalElements),
          )
          const drafts = totals.find((t) => t.status === 'DRAFT')?.count ?? 0
          cy.apiAs(email, 'GET', '/requests?size=1&status=DRAFT').then((l) =>
            expect(drafts, `${email}: drafts = own drafts only`).to.eq(ok(l, 200, 'drafts').totalElements),
          )
        }),
      )
      cy.apiAs(USERS.solicTi, 'GET', '/dashboard/summary').then((d) => {
        const drafts = ok(d, 200, 'dashboard').totals.find((t: Json) => t.status === 'DRAFT')?.count ?? 0
        expect(drafts, 'the requester sees their own draft').to.be.at.least(1)
      })
    })

    it('[DASH-01] switching user without a page reload never shows the previous user’s dashboard', () => {
      cy.login(USERS.solicTi)
      cy.contains('h3', 'Olá, Sofia Lima')
      stat('Rascunho').should('exist')
      cy.contains('.ant-table-row', 'CC-TI-01') // the requester's budget table: own center only
      signOutFromMenu('Sofia Lima')
      // residual = the admin greeting next to the requester's budget table (CC-TI-01 without CC-ADM-02)
      watchDom('__residualDashboard', (doc) => {
        const rows = Array.from(doc.querySelectorAll('.ant-table-row')).map((r) => r.textContent ?? '')
        return (
          (doc.body.textContent ?? '').includes('Olá, Admin Um') &&
          rows.some((t) => t.includes('CC-TI-01')) &&
          !rows.some((t) => t.includes('CC-ADM-02'))
        )
      })
      signInOnForm(USERS.admin1)
      cy.contains('h3', 'Olá, Admin Um')
      cy.contains('.ant-table-row', 'CC-ADM-02') // the admin's data has arrived
      cy.window()
        .its('__residualDashboard')
        .should((seen) =>
          expect(seen, 'the previous user’s dashboard showed up under the admin’s name (stale query cache)').to.eq(
            false,
          ),
        )
    })

    // ---------------- API contract ----------------

    it('[API-02] every error is problem+json with type, title, status, detail, code and requestId; no stack trace', () => {
      const expectProblem = (res: ApiResult, status: number, label: string) => {
        expect(res.status, label).to.eq(status)
        expect(res.json, label).to.include.all.keys('type', 'title', 'status', 'detail', 'code', 'requestId')
        expect(res.json.status, `${label}: status field`).to.eq(status)
        expect(res.json, label).not.to.have.any.keys('trace', 'stackTrace', 'exception')
        expect(JSON.stringify(res.json), `${label}: no Java stack frames`).not.to.match(/\bat (com|org|java)\./)
        if (res.headers)
          expect(res.headers['content-type'], `${label}: Content-Type`).to.match(/^application\/problem\+json/)
        if (status === 400) expect(res.json.errors, '400 lists the field errors').to.be.an('array').that.is.not.empty
      }
      cy.apiToken(USERS.solicTi).then((solic) => {
        cy.apiCall({
          method: 'POST',
          path: '/requests',
          token: solic,
          body: { title: '', category: 'OTHER', items: [] },
        }).then((r) => expectProblem(r, 400, '400'))
        cy.apiCall({ method: 'GET', path: '/requests' }).then((r) => expectProblem(r, 401, '401'))
        cy.apiCall({ method: 'GET', path: '/approvals/inbox', token: solic }).then((r) => expectProblem(r, 403, '403'))
        cy.apiCall({ method: 'GET', path: '/requests/00000000-0000-4000-8000-000000000000', token: solic }).then((r) =>
          expectProblem(r, 404, '404'),
        )
      })
      sandbox().then((sb) =>
        create(sb.requester, { title: `Problem 409 ${uniq()}`, category: 'OTHER', items: [item('10.00')] }).then((d) =>
          cy.apiToken(sb.requester).then((token) =>
            cy
              .apiCall({
                method: 'POST',
                path: `/requests/${d.id}/submit`,
                token,
                body: { lockVersion: d.lockVersion + 5 },
              })
              .then((r) => expectProblem(r, 409, '409')),
          ),
        ),
      )
      sandbox().then((sb) =>
        pending(sb.requester, 'Problem 422').then((p) =>
          cy.apiToken(sb.n1).then((token) =>
            cy
              .apiCall({
                method: 'POST',
                path: `/requests/${p.id}/reject`,
                token,
                body: { lockVersion: p.lockVersion },
              })
              .then((r) => expectProblem(r, 422, '422')),
          ),
        ),
      )
    })

    // ---------------- FE ----------------

    it('[FE-04] the buttons are exactly the allowedActions of the API, per user', () => {
      const ACTION_BUTTON: Record<string, RegExp> = {
        EDIT: /^\s*Editar\s*$/,
        SUBMIT: /^\s*(Submeter|Reenviar.*)\s*$/,
        CANCEL: /^\s*Cancelar\s*$/,
        APPROVE: /^\s*Aprovar\s*$/,
        REJECT: /^\s*Rejeitar\s*$/,
        REQUEST_CHANGES: /^\s*Devolver p\/ ajuste\s*$/,
      }
      sandbox().then((sb) =>
        pending(sb.requester, 'Botões da API').then((p) => {
          ;[sb.requester, sb.n1].forEach((email) =>
            detail(email, p.id).then((r) => {
              cy.login(email)
              cy.visit(`/requests/${p.id}`)
              cy.contains('h3', /REQ-\d+/)
              Object.entries(ACTION_BUTTON).forEach(([action, label]) => {
                if (r.allowedActions.includes(action)) cy.contains('button', label).should('be.visible')
                else cy.contains('button', label).should('not.exist')
              })
            }),
          )
          detail(sb.requester, p.id).its('allowedActions').should('deep.eq', ['CANCEL'])
          detail(sb.n1, p.id).its('allowedActions').should('include.members', ['APPROVE', 'REJECT', 'REQUEST_CHANGES'])
        }),
      )
    })

    it('[FE-05] reject and return both open a modal that requires a 10+ character comment', () => {
      sandbox().then((sb) =>
        pending(sb.requester, 'Modal de comentário').then((p) => {
          cy.login(sb.n1)
          cy.visit(`/requests/${p.id}`)
          cy.contains('h3', /REQ-\d+/)
        }),
      )
      ;[
        { button: /^\s*Rejeitar\s*$/, ok: 'Rejeitar' },
        { button: /^\s*Devolver p\/ ajuste\s*$/, ok: 'Devolver' },
      ].forEach(({ button, ok: okText }) => {
        cy.contains('button', button).click()
        cy.modal().contains('button', okText).click()
        cy.modal().contains('.ant-form-item-explain-error', 'Informe o motivo')
        cy.get('#decision_comment').type('curto')
        cy.modal().contains('button', okText).click()
        cy.modal().contains('.ant-form-item-explain-error', 'Mínimo de 10 caracteres')
        cy.modal().contains('button', 'Voltar').click()
        cy.get('.ant-modal-content:visible').should('not.exist') // closed (antd may also remove it from the DOM)
      })
      cy.contains('.ant-tag', 'Em aprovação') // nothing was sent
    })

    // ---------------- NFR (concurrency and idempotency, through the API) ----------------

    it('[NFR-01] two simultaneous approvals of the same step: exactly one 200, the other 409 with currentLockVersion', () => {
      sandbox().then((sb) => {
        createSubmitted(sb.requester, { title: `Corrida ${uniq()}`, category: 'OTHER', items: [item('500.00')] }).then(
          (r0) =>
            cy.apiToken(USERS.admin1).then((t1) =>
              cy.apiToken(USERS.admin2).then((t2) => {
                const body = { lockVersion: r0.lockVersion }
                cy.apiParallel([
                  { method: 'POST', path: `/requests/${r0.id}/approve`, token: t1, body },
                  { method: 'POST', path: `/requests/${r0.id}/approve`, token: t2, body },
                ]).then((results) => {
                  expect(results.map((r) => r.status).sort()).to.deep.eq([200, 409])
                  const loser = results.find((r) => r.status === 409)!
                  expect(loser.json.code).to.eq('CONCURRENCY_CONFLICT')
                  expect(loser.json.currentLockVersion).to.be.a('number')
                  detail(USERS.admin1, r0.id).its('status').should('eq', 'APPROVED')
                })
              }),
            ),
        )
      })
    })

    it('[NFR-02] final approvals racing for the same balance: the one that fits wins, the other 422; never negative', () => {
      sandbox().then((sb) =>
        newCostCenter('1500.00').then((cc) => {
          const make = (n: number) =>
            createSubmitted(sb.requester, {
              title: `Saldo disputado ${n} ${uniq()}`,
              category: 'OTHER',
              costCenterId: cc.id,
              items: [item('1000.00')],
            })
          make(1).then((a) =>
            make(2).then((b) =>
              cy.apiToken(USERS.admin1).then((t1) =>
                cy.apiToken(USERS.admin2).then((t2) =>
                  cy
                    .apiParallel([
                      {
                        method: 'POST',
                        path: `/requests/${a.id}/approve`,
                        token: t1,
                        body: { lockVersion: a.lockVersion },
                      },
                      {
                        method: 'POST',
                        path: `/requests/${b.id}/approve`,
                        token: t2,
                        body: { lockVersion: b.lockVersion },
                      },
                    ])
                    .then((results) => {
                      expect(results.map((r) => r.status).sort()).to.deep.eq([200, 422])
                      expect(results.find((r) => r.status === 422)!.json.code).to.eq('BUDGET_EXCEEDED')
                      budget(cc.id).then((bud) => {
                        expect(bud.consumed).to.eq('1000.00')
                        expect(cents(bud.available)).to.be.at.least(0)
                      })
                    }),
                ),
              ),
            ),
          )
        }),
      )
    })

    it('[NFR-03] POST /requests is idempotent with Idempotency-Key; another payload with the same key is 409', () => {
      sandbox().then((sb) => {
        const key = `k-avaliador-${uniq().toLowerCase()}`
        const title = `Idempotente ${uniq()}`
        const body = { title, category: 'OTHER', items: [item('10.00')] }
        cy.apiToken(sb.requester).then((token) => {
          const post = (b: object) =>
            cy.apiCall({ method: 'POST', path: '/requests', token, body: b, headers: { 'Idempotency-Key': key } })
          post(body).then((first) => {
            const created = ok(first, 201, 'first POST')
            post(body).then((again) => {
              expect(ok(again, 201, 'retry with the same key').id, 'same request replayed').to.eq(created.id)
              if (again.headers) expect(again.headers['idempotent-replayed']).to.eq('true')
            })
            cy.apiCall({ method: 'GET', path: `/requests?size=10&q=${encodeURIComponent(title)}`, token }).then((r) =>
              expect(ok(r, 200, 'list').totalElements, 'only one request created').to.eq(1),
            )
            post({ ...body, title: `${title} alterado` }).then((r) =>
              refused(r, 409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'same key, other payload'),
            )
          })
        })
      })
    })

    // ---------------- EXTRA ----------------

    it('[EXTRA-01] extra filters minAmount, maxAmount and q; the dashboard has the 30-day average approval time', () => {
      cy.apiAs(USERS.admin1, 'GET', '/requests?size=100&minAmount=10000').then((r) => {
        const data = ok(r, 200, 'minAmount').data
        expect(data).not.to.be.empty
        data.forEach((x: Json) => expect(cents(x.total)).to.be.at.least(cents('10000')))
      })
      cy.apiAs(USERS.admin1, 'GET', '/requests?size=100&maxAmount=1000').then((r) =>
        ok(r, 200, 'maxAmount').data.forEach((x: Json) => expect(cents(x.total)).to.be.at.most(cents('1000'))),
      )
      cy.apiAs(USERS.admin1, 'GET', '/requests?size=100&q=notebooks').then((r) => {
        const data = ok(r, 200, 'q').data
        expect(data).not.to.be.empty
        data.forEach((x: Json) => expect(x.title.toLowerCase()).to.contain('notebooks'))
      })
      cy.apiAs(USERS.admin1, 'GET', '/dashboard/summary').then((r) =>
        expect(ok(r, 200, 'dashboard').averageApprovalTimeDays).to.be.a('number'),
      )
      cy.login(USERS.admin1)
      cy.contains('Tempo médio de aprovação')
    })
  })
}
