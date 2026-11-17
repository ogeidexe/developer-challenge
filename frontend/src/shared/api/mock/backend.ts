// Fake backend implementing docs/api/openapi.yaml semantics in-memory (state machine, chains,
// segregation, budget, versions, idempotency, visibility, 404/403/409/422 ordering per the blueprint).
import type {
  AllowedAction,
  ApproverLevel,
  Category,
  DashboardSummaryDto,
  ItemDto,
  Page,
  ProblemDetail,
  RequestDetailDto,
  RequestEventDto,
  RequestItemInput,
  RequestStatus,
  RequestSummaryDto,
  RequestVersionDto,
  Role,
  StepLevel,
  StepStatus,
  UserDto,
} from '../types'
import {
  brl,
  centsToMoney,
  chainFor,
  competenceMonth,
  hashPayload,
  isFutureDate,
  moneyToCents,
  validYearMonth,
} from './domain'
import { seed, type BudgetRec, type MockDb, type RequestRec, type UserRec, type VersionRec } from './data'
import { FULL_NAME } from '../../validation'

const FULL_NAME_MESSAGE = 'informe nome e sobrenome, só com letras (acentos permitidos) e espaços simples'

// Request bodies arrive as untyped JSON (like on a real server) and are validated field by field below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberate: the fake API must accept any payload
type JsonBody = any

export interface MockRequest {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  headers: Record<string, string>
}
export interface MockResponse {
  status: number
  json: unknown
}

class MockError extends Error {
  constructor(public response: MockResponse) {
    super((response.json as ProblemDetail).code)
  }
}

// The fake DB survives page reloads (localStorage) so a refresh — or cy.visit in E2E tests — keeps the
// session and the data. Cypress clears storage between tests, so every test starts from a fresh seed.
const STORAGE_KEY = 'kp_mock_db_v1'

function loadDb(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MockDb
  } catch {
    /* storage unavailable or corrupt → fresh seed */
  }
  return seed()
}
function persistDb(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* in-memory only */
  }
}

let db: MockDb = loadDb()
let reqId = 'local'

export function resetMock(): void {
  db = seed()
  persistDb()
}

const TITLES: Record<string, string> = {
  UNAUTHENTICATED: 'Não autenticado',
  FORBIDDEN: 'Acesso negado',
  NOT_REQUEST_OWNER: 'Ação restrita ao proprietário',
  NOT_FOUND: 'Recurso não encontrado',
  CONCURRENCY_CONFLICT: 'Conflito de concorrência',
  IDEMPOTENCY_PAYLOAD_MISMATCH: 'Idempotency-Key reutilizada',
  EMAIL_ALREADY_REGISTERED: 'E-mail já cadastrado',
  CODE_ALREADY_USED: 'Código já utilizado',
  VALIDATION_FAILED: 'Entrada inválida',
  INVALID_TRANSITION: 'Transição inválida',
  SELF_APPROVAL_FORBIDDEN: 'Segregação de funções',
  DUPLICATE_APPROVER: 'Segregação de funções',
  APPROVER_NOT_ELIGIBLE: 'Aprovador não elegível',
  COMMENT_REQUIRED: 'Comentário obrigatório',
  BUDGET_EXCEEDED: 'Orçamento insuficiente',
  BUDGET_BELOW_CONSUMED: 'Orçamento abaixo do consumido',
  INVALID_MONTH_FORMAT: 'Mês inválido',
  INVALID_SORT: 'Ordenação inválida',
}

function fail(status: number, code: string, detail: string, extra: Partial<ProblemDetail> = {}): never {
  throw new MockError({
    status,
    json: {
      type: `https://kingspan.example/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      title: TITLES[code] ?? code,
      status,
      detail,
      code,
      requestId: reqId,
      ...extra,
    },
  })
}

// ---------- tokens (fake JWT: base64 payload, 15 min) ----------
function makeToken(u: UserRec): string {
  const now = Date.now()
  const payload = {
    sub: u.id,
    role: u.role,
    costCenterId: u.costCenterId,
    approverLevel: u.approverLevel,
    name: u.name,
    email: u.email,
    iat: now,
    exp: now + 900_000,
    jti: Math.random().toString(36).slice(2),
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
}
function readToken(token: string): { sub: string; exp: number } | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(token))))
  } catch {
    return null
  }
}

function authenticate(headers: Record<string, string>): UserRec {
  const h = headers['authorization'] ?? ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : null
  const payload = token ? readToken(token) : null
  const user = payload ? db.users.find((u) => u.id === payload.sub) : undefined
  if (!payload || !user || payload.exp < Date.now() || !user.active) {
    fail(401, 'UNAUTHENTICATED', 'Token ausente, inválido ou expirado.')
  }
  return user!
}

// ---------- domain helpers ----------
const FINAL: RequestStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED']

function visibleTo(u: UserRec, r: RequestRec): boolean {
  if (r.ownerId === u.id) return true
  if (r.status === 'DRAFT') return false // A-26: owner-only, no ADMIN exception
  if (u.role === 'ADMIN') return true
  if (u.role === 'APROVADOR') return r.costCenterId === u.costCenterId
  return false
}
function getVisible(u: UserRec, id: string): RequestRec {
  const r = db.requests.find((x) => x.id === id)
  if (!r || !visibleTo(u, r)) fail(404, 'NOT_FOUND', 'Solicitação não encontrada.')
  return r!
}
function currentVersion(r: RequestRec): VersionRec | null {
  return r.versions.find((v) => v.versionNumber === r.currentVersion) ?? null
}
function currentStep(v: VersionRec | null): VersionRec['steps'][number] | null {
  return v ? (v.steps.find((s) => s.status === 'PENDING') ?? null) : null
}
function eligible(u: UserRec, v: VersionRec, step: { level: StepLevel }): boolean {
  if (u.role === 'ADMIN') return true // ADMIN approves any level (FR-016)
  if (u.role !== 'APROVADOR') return false
  if (u.costCenterId !== v.costCenterId) return false // the version's frozen center (A-28)
  if (step.level === 'NIVEL_1') return true
  if (step.level === 'NIVEL_2') return u.approverLevel === 'NIVEL_2'
  return false
}
function segregationBlock(u: UserRec, r: RequestRec, v: VersionRec): string | null {
  if (u.id === r.ownerId) return 'SELF_APPROVAL_FORBIDDEN'
  if (v.steps.some((s) => s.approverId === u.id)) return 'DUPLICATE_APPROVER'
  return null
}
/** A-31: steps after the deciding one were never reached — a closed version keeps no PENDING step. */
function skipRemaining(v: VersionRec, afterSequence: number): void {
  for (const s of v.steps) if (s.sequence > afterSequence && s.status === 'PENDING') s.status = 'SKIPPED'
}

function checkLock(r: RequestRec, body: JsonBody): void {
  const lv = body?.lockVersion
  if (typeof lv !== 'number' || lv < 1) {
    fail(400, 'VALIDATION_FAILED', 'lockVersion é obrigatório.', {
      errors: [{ field: 'lockVersion', message: 'lockVersion é obrigatório', code: 'REQUIRED' }],
    })
  }
  if (lv !== r.lockVersion) {
    fail(
      409,
      'CONCURRENCY_CONFLICT',
      `A solicitação foi alterada por outro usuário. lockVersion atual: ${r.lockVersion}.`,
      { currentLockVersion: r.lockVersion },
    )
  }
}
function addEvent(
  r: RequestRec,
  actor: UserRec | null,
  action: string,
  from: RequestStatus | null,
  to: RequestStatus | null,
  o: { stepLevel?: StepLevel | null; stepSequence?: number | null; comment?: string | null } = {},
): void {
  db.events.push({
    id: ++db.seqEvent,
    requestId: r.id,
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? 'ADMIN',
    action,
    fromStatus: from,
    toStatus: to,
    stepLevel: o.stepLevel ?? null,
    stepSequence: o.stepSequence ?? null,
    versionNumber: r.currentVersion,
    comment: o.comment ?? null,
    xRequestId: reqId,
    occurredAt: new Date().toISOString(),
  })
}
function ccCode(id: string): string {
  return db.costCenters.find((c) => c.id === id)?.code ?? '?'
}
function userName(id: string): string {
  return db.users.find((u) => u.id === id)?.name ?? 'Sistema'
}

// ---------- DTO mappers ----------
function userDto(u: UserRec): UserDto {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    approverLevel: u.approverLevel,
    costCenterId: u.costCenterId,
    active: u.active,
    createdAt: u.createdAt,
    lockVersion: u.lockVersion,
  }
}
function itemDto(i: {
  position: number
  description: string
  quantity: number
  unitPriceCents: number
  lineTotalCents: number
}): ItemDto {
  return {
    position: i.position,
    description: i.description,
    quantity: i.quantity,
    unitPrice: centsToMoney(i.unitPriceCents),
    lineTotal: centsToMoney(i.lineTotalCents),
  }
}
function stepDto(s: {
  sequence: number
  level: StepLevel
  status: StepStatus
  approverId: string | null
  decidedAt: string | null
  comment: string | null
}) {
  return {
    sequence: s.sequence,
    level: s.level,
    status: s.status,
    approver: s.approverId ? { id: s.approverId, name: userName(s.approverId) } : null,
    decidedAt: s.decidedAt,
    comment: s.comment,
  }
}
/** DRAFT / CHANGES_REQUESTED show the editable working copy; every other status shows the frozen version. */
const isEditable = (r: RequestRec) => r.status === 'DRAFT' || r.status === 'CHANGES_REQUESTED'
function shownItems(r: RequestRec) {
  return isEditable(r) ? r.items : (currentVersion(r)?.items ?? r.items)
}
const totalOf = (items: RequestRec['items']) => items.reduce((s, i) => s + i.lineTotalCents, 0)

function summaryDto(r: RequestRec): RequestSummaryDto {
  const totalCents = totalOf(shownItems(r))
  return {
    id: r.id,
    requestNumber: r.requestNumber,
    title: r.title,
    category: r.category,
    status: r.status,
    total: centsToMoney(totalCents),
    owner: { id: r.ownerId, name: userName(r.ownerId) },
    costCenter: { id: r.costCenterId, code: ccCode(r.costCenterId) },
    currentVersion: r.currentVersion,
    neededBy: r.neededBy,
    createdAt: r.createdAt,
    submittedAt: r.submittedAt,
  }
}
function canActNow(u: UserRec, r: RequestRec): boolean {
  if (r.status !== 'PENDING_APPROVAL') return false
  const v = currentVersion(r)
  const s = currentStep(v)
  if (!v || !s) return false
  if (segregationBlock(u, r, v)) return false
  return eligible(u, v, s)
}
function allowedActions(u: UserRec, r: RequestRec): AllowedAction[] {
  if (FINAL.includes(r.status)) return []
  const acts: AllowedAction[] = []
  const owner = r.ownerId === u.id
  if (owner && (r.status === 'DRAFT' || r.status === 'CHANGES_REQUESTED')) acts.push('EDIT', 'SUBMIT')
  if (owner || u.role === 'ADMIN') acts.push('CANCEL')
  if (canActNow(u, r)) acts.push('APPROVE', 'REJECT', 'REQUEST_CHANGES')
  return acts
}
function detailDto(u: UserRec, r: RequestRec): RequestDetailDto {
  const v = currentVersion(r)
  const items = shownItems(r).map(itemDto)
  return {
    ...summaryDto(r),
    description: r.description,
    competenceMonth: v?.competenceMonth ?? null,
    decidedAt: r.decidedAt,
    items,
    steps: (v?.steps ?? []).map(stepDto),
    versions: r.versions.map((x) => ({ versionNumber: x.versionNumber, submittedAt: x.submittedAt })),
    allowedActions: allowedActions(u, r),
    lockVersion: r.lockVersion,
  }
}
function versionDto(v: VersionRec): RequestVersionDto {
  return {
    versionNumber: v.versionNumber,
    title: v.title,
    description: v.description,
    category: v.category,
    costCenter: { id: v.costCenterId, code: ccCode(v.costCenterId) },
    neededBy: v.neededBy,
    total: centsToMoney(v.totalCents),
    competenceMonth: v.competenceMonth,
    submittedAt: v.submittedAt,
    submittedBy: { id: v.submittedBy, name: userName(v.submittedBy) },
    items: v.items.map(itemDto),
    steps: v.steps.map(stepDto),
  }
}
function eventDto(e: MockDb['events'][number]): RequestEventDto {
  return {
    id: e.id,
    actor: e.actorId ? { id: e.actorId, name: userName(e.actorId) } : null,
    actorRole: e.actorRole,
    action: e.action,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    stepLevel: e.stepLevel,
    stepSequence: e.stepSequence,
    versionNumber: e.versionNumber,
    comment: e.comment,
    xRequestId: e.xRequestId,
    occurredAt: e.occurredAt,
  }
}
function page<T>(all: T[], q: URLSearchParams): Page<T> {
  const pageNo = Math.max(0, parseInt(q.get('page') ?? '0', 10) || 0)
  const size = Math.min(100, Math.max(1, parseInt(q.get('size') ?? '20', 10) || 20))
  const total = all.length
  return {
    data: all.slice(pageNo * size, pageNo * size + size),
    page: pageNo,
    size,
    totalElements: total,
    totalPages: Math.ceil(total / size),
  }
}

// ---------- payload validation ----------
function validateRequestPayload(body: JsonBody): void {
  const errors: { field: string; message: string; code: string }[] = []
  const b = body ?? {}
  if (typeof b.title !== 'string' || b.title.trim().length < 3 || b.title.length > 120)
    errors.push({ field: 'title', message: 'Título deve ter 3–120 caracteres', code: 'INVALID' })
  if (b.description != null && (typeof b.description !== 'string' || b.description.length > 2000))
    errors.push({ field: 'description', message: 'Descrição deve ter no máximo 2000 caracteres', code: 'INVALID' })
  const cats: Category[] = ['EQUIPMENT', 'SERVICES', 'SUPPLIES', 'TRAVEL', 'SOFTWARE', 'OTHER']
  if (!cats.includes(b.category)) errors.push({ field: 'category', message: 'Categoria inválida', code: 'INVALID' })
  if (b.neededBy != null && !isFutureDate(b.neededBy))
    errors.push({ field: 'neededBy', message: 'neededBy deve ser uma data futura (yyyy-mm-dd)', code: 'INVALID' })
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50) {
    errors.push({ field: 'items', message: 'Informe de 1 a 50 itens', code: 'INVALID' })
  } else {
    b.items.forEach((it: RequestItemInput, i: number) => {
      if (typeof it.description !== 'string' || it.description.trim().length < 1 || it.description.length > 255)
        errors.push({
          field: `items[${i}].description`,
          message: 'Descrição do item é obrigatória (1–255)',
          code: 'INVALID',
        })
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 1000000)
        errors.push({
          field: `items[${i}].quantity`,
          message: 'Quantidade deve ser inteiro entre 1 e 1.000.000',
          code: 'INVALID',
        })
      const cents = moneyToCents(it.unitPrice)
      if (!Number.isFinite(cents) || cents <= 0)
        errors.push({
          field: `items[${i}].unitPrice`,
          message: 'Preço unitário inválido (ex.: 4899.90)',
          code: 'INVALID',
        })
    })
  }
  if (b.costCenterId != null && !db.costCenters.some((c) => c.id === b.costCenterId))
    errors.push({ field: 'costCenterId', message: 'Centro de custo não encontrado', code: 'INVALID' })
  if (errors.length) fail(400, 'VALIDATION_FAILED', 'Um ou mais campos são inválidos.', { errors })
}

// ---------- request lifecycle ----------
function toItems(body: JsonBody): RequestRec['items'] {
  return body.items.map((it: RequestItemInput, i: number) => {
    const unitPriceCents = moneyToCents(it.unitPrice)
    return {
      position: i,
      description: it.description.trim(),
      quantity: it.quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * it.quantity,
    }
  })
}

function doSubmit(u: UserRec, r: RequestRec, body: JsonBody): RequestDetailDto {
  if (r.ownerId !== u.id) fail(403, 'NOT_REQUEST_OWNER', 'Apenas o proprietário pode submeter esta solicitação.')
  checkLock(r, body)
  const from = r.status
  if (from !== 'DRAFT' && from !== 'CHANGES_REQUESTED')
    fail(422, 'INVALID_TRANSITION', `Não é possível submeter: a solicitação está em status ${from}.`)
  if (r.items.length === 0) fail(422, 'INVALID_TRANSITION', 'Não é possível submeter: adicione ao menos um item.')
  const n = r.currentVersion + 1
  const now = new Date()
  const totalCents = r.items.reduce((s, i) => s + i.lineTotalCents, 0)
  const v: VersionRec = {
    versionNumber: n,
    title: r.title,
    description: r.description,
    category: r.category,
    costCenterId: r.costCenterId,
    neededBy: r.neededBy,
    totalCents,
    competenceMonth: competenceMonth(now),
    submittedBy: u.id,
    submittedAt: now.toISOString(),
    items: r.items.map((i) => ({ ...i })),
    steps: chainFor(totalCents, r.category).map((level, i) => ({
      sequence: i + 1,
      level,
      status: 'PENDING' as StepStatus,
      approverId: null,
      decidedAt: null,
      comment: null,
    })),
  }
  r.versions.push(v)
  r.currentVersion = n
  r.status = 'PENDING_APPROVAL'
  r.submittedAt = now.toISOString()
  r.lockVersion++
  addEvent(r, u, n > 1 ? 'RESUBMITTED' : 'SUBMITTED', from, 'PENDING_APPROVAL')
  return detailDto(u, r)
}

function doDecide(
  u: UserRec,
  r: RequestRec,
  action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES',
  body: JsonBody,
): RequestDetailDto {
  if (u.role === 'SOLICITANTE') fail(403, 'FORBIDDEN', 'SOLICITANTE não pode executar ações de aprovação.')
  checkLock(r, body)
  const from = r.status
  if (from !== 'PENDING_APPROVAL')
    fail(
      422,
      'INVALID_TRANSITION',
      `Não é possível ${action === 'APPROVE' ? 'aprovar' : action === 'REJECT' ? 'rejeitar' : 'devolver'}: a solicitação está em status ${from}.`,
    )
  const v = currentVersion(r)!
  const step = currentStep(v)!
  if (!eligible(u, v, step)) {
    fail(
      422,
      'APPROVER_NOT_ELIGIBLE',
      `Não é possível aprovar: a etapa ${step.level} exige ${step.level === 'NIVEL_1' ? 'APROVADOR NIVEL_1 ou NIVEL_2 do centro de custo' : step.level === 'NIVEL_2' ? 'APROVADOR NIVEL_2 do centro de custo' : 'ADMIN'}.`,
    )
  }
  const seg = segregationBlock(u, r, v)
  if (seg === 'SELF_APPROVAL_FORBIDDEN')
    fail(422, seg, 'Não é possível aprovar: você é o solicitante desta solicitação (segregação de funções).')
  if (seg === 'DUPLICATE_APPROVER')
    fail(422, seg, `Não é possível aprovar: você já aprovou uma etapa desta versão (segregação de funções).`)
  const comment = typeof body?.comment === 'string' ? body.comment : null
  if (action !== 'APPROVE' && (!comment || comment.trim().length < 10)) {
    fail(
      422,
      'COMMENT_REQUIRED',
      'Comentário obrigatório (mínimo de 10 caracteres) ao rejeitar ou devolver para ajuste.',
    )
  }
  const now = new Date()
  const isFinal = action === 'APPROVE' && v.steps.filter((s) => s.status === 'PENDING').length === 1
  let budget: BudgetRec | undefined
  if (isFinal) {
    // final step: consume the VERSION's frozen cost center in its competence month (A-28, BR-007).
    // Checked before ANY mutation: a failure leaves step, status and lockVersion untouched (full rollback);
    // only the audit event is kept, as the real backend does in a separate transaction.
    budget = db.budgets.find((x) => x.costCenterId === v.costCenterId && x.yearMonth === v.competenceMonth)
    const available = budget ? budget.amountCents - budget.consumedCents : 0 // BR-008: missing month = zero
    if (v.totalCents > available) {
      addEvent(r, u, 'APPROVAL_FAILED_BUDGET', from, 'PENDING_APPROVAL', {
        stepLevel: step.level,
        stepSequence: step.sequence,
        comment,
      })
      fail(
        422,
        'BUDGET_EXCEEDED',
        `O centro de custo ${ccCode(v.costCenterId)} tem ${brl(available)} disponíveis em ${v.competenceMonth}; a solicitação exige ${brl(v.totalCents)}.`,
      )
    }
  }

  // ---- all checks passed: apply ----
  const stepStatus: StepStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'RETURNED'
  step.status = stepStatus
  step.approverId = u.id
  step.decidedAt = now.toISOString()
  step.comment = comment
  r.lockVersion++
  if (isFinal) {
    budget!.consumedCents += v.totalCents
    r.status = 'APPROVED'
    r.decidedAt = now.toISOString()
  } else if (action === 'REJECT') {
    skipRemaining(v, step.sequence)
    r.status = 'REJECTED'
    r.decidedAt = now.toISOString()
  } else if (action === 'REQUEST_CHANGES') {
    skipRemaining(v, step.sequence)
    r.status = 'CHANGES_REQUESTED'
  }
  addEvent(
    r,
    u,
    action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'CHANGES_REQUESTED',
    from,
    r.status,
    { stepLevel: step.level, stepSequence: step.sequence, comment },
  )
  return detailDto(u, r)
}

function doCancel(u: UserRec, r: RequestRec, body: JsonBody): RequestDetailDto {
  if (r.ownerId !== u.id && u.role !== 'ADMIN')
    fail(403, 'NOT_REQUEST_OWNER', 'Somente o proprietário ou um ADMIN pode cancelar esta solicitação.')
  checkLock(r, body)
  const from = r.status
  if (!['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes(from))
    fail(422, 'INVALID_TRANSITION', `Não é possível cancelar: a solicitação está em status final (${from}).`)
  const now = new Date().toISOString()
  if (from === 'PENDING_APPROVAL') {
    const v = currentVersion(r)!
    const s = currentStep(v)
    if (s) {
      s.status = 'CANCELLED'
      s.decidedAt = now
      skipRemaining(v, s.sequence)
    }
  }
  r.status = 'CANCELLED'
  r.decidedAt = now
  r.lockVersion++
  addEvent(r, u, 'CANCELLED', from, 'CANCELLED')
  return detailDto(u, r)
}

// ---------- router ----------
function sortBy(q: URLSearchParams): (a: RequestRec, b: RequestRec) => number {
  const raw = q.get('sort') ?? 'createdAt,desc'
  const [field, dirRaw] = raw.split(',')
  const dir = dirRaw === 'asc' ? 1 : -1
  const allowed: Record<string, (r: RequestRec) => string | number> = {
    createdAt: (r) => r.createdAt,
    title: (r) => r.title.toLowerCase(),
    total: (r) => totalOf(shownItems(r)),
    status: (r) => r.status,
    submittedAt: (r) => r.submittedAt ?? '',
  }
  const key = allowed[field]
  if (!key)
    fail(
      400,
      'INVALID_SORT',
      `Campo de ordenação desconhecido '${field}'. Permitidos: createdAt, title, total, status, submittedAt.`,
    )
  return (a, b) => {
    const ka = key(a),
      kb = key(b)
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir
  }
}

function applyFilters(all: RequestRec[], u: UserRec, q: URLSearchParams): RequestRec[] {
  let list = all.filter((r) => visibleTo(u, r))
  const status = q.get('status')
  if (status) list = list.filter((r) => r.status === status)
  const category = q.get('category')
  if (category) list = list.filter((r) => r.category === category)
  const cc = q.get('costCenterId')
  if (cc) {
    const ids = cc.split(',')
    list = list.filter((r) => ids.includes(r.costCenterId))
  }
  const from = q.get('createdFrom')
  if (from) list = list.filter((r) => r.createdAt.slice(0, 10) >= from)
  const to = q.get('createdTo')
  if (to) list = list.filter((r) => r.createdAt.slice(0, 10) <= to)
  const min = q.get('minAmount')
  if (min) {
    const c = moneyToCents(min)
    list = list.filter((r) => totalOf(shownItems(r)) >= c)
  }
  const max = q.get('maxAmount')
  if (max) {
    const c = moneyToCents(max)
    list = list.filter((r) => totalOf(shownItems(r)) <= c)
  }
  const search = q.get('q')
  if (search) list = list.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()))
  return list.sort(sortBy(q))
}

function listInbox(u: UserRec, q: URLSearchParams) {
  if (u.role === 'SOLICITANTE') fail(403, 'FORBIDDEN', 'SOLICITANTE não possui caixa de aprovação.')
  const list = db.requests
    .filter((r) => r.status === 'PENDING_APPROVAL')
    .filter((r) => r.ownerId !== u.id)
    .filter((r) => u.role === 'ADMIN' || r.costCenterId === u.costCenterId)
    .filter((r) => canActNow(u, r))
    .sort(sortBy(q))
  return page(
    list.map((r) => ({ ...summaryDto(r), currentStep: stepDto(currentStep(currentVersion(r))!) })),
    q,
  )
}

function dashboard(u: UserRec): DashboardSummaryDto {
  const scoped = db.requests.filter((r) => visibleTo(u, r))
  const totals = (
    ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'] as RequestStatus[]
  )
    .map((status) => ({ status, count: scoped.filter((r) => r.status === status).length }))
    .filter((t) => t.count > 0)
  const month = competenceMonth(new Date())
  const centers = u.role === 'ADMIN' ? db.costCenters : db.costCenters.filter((c) => c.id === u.costCenterId)
  const budgets = centers.map((c) => {
    const b = db.budgets.find((x) => x.costCenterId === c.id && x.yearMonth === month)
    const amount = b?.amountCents ?? 0,
      consumed = b?.consumedCents ?? 0
    return {
      costCenterId: c.id,
      code: c.code,
      name: c.name,
      month,
      amount: centsToMoney(amount),
      consumed: centsToMoney(consumed),
      available: centsToMoney(amount - consumed),
    }
  })
  const cutoff = Date.now() - 30 * 24 * 3600_000
  const decided = scoped.filter(
    (r) =>
      (r.status === 'APPROVED' || r.status === 'REJECTED') && r.decidedAt && new Date(r.decidedAt).getTime() >= cutoff,
  )
  let avg: number | null = null
  if (decided.length) {
    const days = decided.map((r) => {
      const first = db.events
        .filter((e) => e.requestId === r.id && (e.action === 'SUBMITTED' || e.action === 'RESUBMITTED'))
        .map((e) => new Date(e.occurredAt).getTime())
      const start = first.length ? Math.min(...first) : new Date(r.createdAt).getTime()
      return (new Date(r.decidedAt!).getTime() - start) / 86_400_000
    })
    avg = Math.round((days.reduce((s, x) => s + x, 0) / days.length) * 10) / 10
  }
  return { totals, budgets, averageApprovalTimeDays: avg }
}

function validateUserPayload(b: JsonBody, isCreate: boolean, existing?: UserRec): Partial<UserRec> {
  const errors: { field: string; message: string; code: string }[] = []
  if (isCreate) {
    if (typeof b.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email))
      errors.push({ field: 'email', message: 'E-mail inválido', code: 'INVALID' })
    if (
      typeof b.password !== 'string' ||
      b.password.length < 8 ||
      !/[a-zA-Z]/.test(b.password) ||
      !/\d/.test(b.password)
    )
      errors.push({ field: 'password', message: 'Senha deve ter ≥ 8 caracteres com letras e dígitos', code: 'INVALID' })
  }
  if (
    b.name != null &&
    (typeof b.name !== 'string' || b.name.length < 5 || b.name.length > 120 || !FULL_NAME.test(b.name))
  )
    errors.push({ field: 'name', message: FULL_NAME_MESSAGE, code: 'INVALID' })
  const role = b.role ?? existing?.role
  const level = b.approverLevel !== undefined ? b.approverLevel : (existing?.approverLevel ?? null)
  const ccId = b.costCenterId !== undefined ? b.costCenterId : (existing?.costCenterId ?? null)
  if (role != null && !['SOLICITANTE', 'APROVADOR', 'ADMIN'].includes(role))
    errors.push({ field: 'role', message: 'Papel inválido', code: 'INVALID' })
  if (level != null && !['NIVEL_1', 'NIVEL_2'].includes(level))
    errors.push({ field: 'approverLevel', message: 'Nível inválido', code: 'INVALID' })
  if (role === 'APROVADOR' && level == null)
    errors.push({ field: 'approverLevel', message: 'Obrigatório para APROVADOR', code: 'REQUIRED' })
  if (role !== 'APROVADOR' && level != null)
    errors.push({ field: 'approverLevel', message: 'Somente APROVADOR possui nível', code: 'INVALID' })
  if (ccId != null && !db.costCenters.some((c) => c.id === ccId))
    errors.push({ field: 'costCenterId', message: 'Centro de custo não encontrado', code: 'INVALID' })
  if (ccId == null && role !== 'ADMIN')
    errors.push({
      field: 'costCenterId',
      message: 'Somente ADMIN pode ser global (sem centro de custo)',
      code: 'REQUIRED',
    })
  if (errors.length) fail(400, 'VALIDATION_FAILED', 'Um ou mais campos são inválidos.', { errors })
  return { role, approverLevel: level, costCenterId: ccId, name: b.name, email: b.email, password: b.password }
}

export async function mockHandle(request: MockRequest): Promise<MockResponse> {
  await new Promise((r) => setTimeout(r, 80 + Math.random() * 140))
  try {
    return handle(request)
  } finally {
    // writes (incl. the APPROVAL_FAILED_BUDGET audit event on a 422) must survive a reload
    if (request.method !== 'GET') persistDb()
  }
}

function handle(request: MockRequest): MockResponse {
  // HTTP header names are case-insensitive: normalize once (the client sends "Authorization", "X-Request-Id"…)
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(request.headers)) headers[k.toLowerCase()] = v
  reqId = headers['x-request-id'] ?? 'local-' + Math.random().toString(36).slice(2)
  const { method, path, query } = request
  const body: JsonBody = request.body ?? {}
  const seg = path.split('/').filter(Boolean)

  try {
    // ---- public ----
    if (method === 'POST' && path === '/auth/register') {
      const errors: { field: string; message: string; code: string }[] = []
      if (typeof body.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email))
        errors.push({ field: 'email', message: 'E-mail inválido', code: 'INVALID' })
      if (
        typeof body.password !== 'string' ||
        body.password.length < 8 ||
        !/[a-zA-Z]/.test(body.password) ||
        !/\d/.test(body.password)
      )
        errors.push({
          field: 'password',
          message: 'Senha deve ter ≥ 8 caracteres com letras e dígitos',
          code: 'INVALID',
        })
      if (typeof body.name !== 'string' || body.name.length < 5 || body.name.length > 120 || !FULL_NAME.test(body.name))
        errors.push({ field: 'name', message: FULL_NAME_MESSAGE, code: 'INVALID' })
      if (!db.costCenters.some((c) => c.id === body.costCenterId))
        errors.push({
          field: 'costCenterId',
          message: 'Centro de custo é obrigatório e deve existir',
          code: 'REQUIRED',
        })
      if (errors.length) fail(400, 'VALIDATION_FAILED', 'Um ou mais campos são inválidos.', { errors })
      if (db.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase()))
        fail(409, 'EMAIL_ALREADY_REGISTERED', 'E-mail já cadastrado.')
      const u: UserRec = {
        id: crypto.randomUUID(),
        email: body.email,
        password: body.password,
        name: body.name.trim(),
        role: 'SOLICITANTE',
        approverLevel: null,
        costCenterId: body.costCenterId,
        active: true,
        lockVersion: 1,
        createdAt: new Date().toISOString(),
      }
      db.users.push(u)
      return { status: 201, json: userDto(u) }
    }
    if (method === 'POST' && path === '/auth/login') {
      const u = db.users.find((x) => x.email.toLowerCase() === String(body.email ?? '').toLowerCase())
      if (!u || u.password !== body.password || !u.active) fail(401, 'UNAUTHENTICATED', 'Credenciais inválidas.')
      return { status: 200, json: { token: makeToken(u), tokenType: 'Bearer', expiresIn: 900, user: userDto(u) } }
    }
    if (method === 'GET' && path === '/health') {
      return { status: 200, json: { status: 'UP', db: 'UP', timestamp: new Date().toISOString() } }
    }
    // public: registration needs the center list to bind a new SOLICITANTE
    if (method === 'GET' && path === '/cost-centers') {
      return { status: 200, json: db.costCenters }
    }

    const u = authenticate(headers)

    if (method === 'GET' && path === '/auth/me') return { status: 200, json: userDto(u) }
    // the real API deletes the Redis session (ADR-015); the fake backend has no sessions to end
    if (method === 'POST' && path === '/auth/logout') return { status: 204, json: {} }

    // ---- users (admin) ----
    if (path === '/users' && method === 'GET') {
      if (u.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Somente ADMIN pode listar usuários.')
      let list = [...db.users]
      const role = query.get('role')
      if (role) list = list.filter((x) => x.role === role)
      const cc = query.get('costCenterId')
      if (cc) list = list.filter((x) => x.costCenterId === cc)
      const search = query.get('q')
      if (search)
        list = list.filter(
          (x) =>
            x.name.toLowerCase().includes(search.toLowerCase()) || x.email.toLowerCase().includes(search.toLowerCase()),
        )
      return { status: 200, json: page(list.map(userDto), query) }
    }
    if (path === '/users' && method === 'POST') {
      if (u.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Somente ADMIN pode criar usuários.')
      const v = validateUserPayload(body, true)
      if (db.users.some((x) => x.email.toLowerCase() === v.email!.toLowerCase()))
        fail(409, 'EMAIL_ALREADY_REGISTERED', 'E-mail já cadastrado.')
      const nu: UserRec = {
        id: crypto.randomUUID(),
        email: v.email!,
        password: v.password!,
        name: v.name!.trim(),
        role: v.role as Role,
        approverLevel: v.approverLevel as ApproverLevel | null,
        costCenterId: v.costCenterId!,
        active: true,
        lockVersion: 1,
        createdAt: new Date().toISOString(),
      }
      db.users.push(nu)
      return { status: 201, json: userDto(nu) }
    }
    if (seg[0] === 'users' && seg[1] && method === 'PATCH') {
      if (u.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Somente ADMIN pode editar usuários.')
      const target = db.users.find((x) => x.id === seg[1])
      if (!target) fail(404, 'NOT_FOUND', 'Usuário não encontrado.')
      if (body.lockVersion != null && body.lockVersion !== target.lockVersion)
        fail(409, 'CONCURRENCY_CONFLICT', 'Usuário alterado por outro administrador.', {
          currentLockVersion: target.lockVersion,
        })
      const v = validateUserPayload(body, false, target)
      if (
        v.email &&
        v.email.toLowerCase() !== target.email.toLowerCase() &&
        db.users.some((x) => x.email.toLowerCase() === v.email!.toLowerCase())
      )
        fail(409, 'EMAIL_ALREADY_REGISTERED', 'E-mail já cadastrado.')
      Object.assign(target, {
        name: v.name ?? target.name,
        role: v.role ?? target.role,
        approverLevel: v.approverLevel !== undefined ? v.approverLevel : target.approverLevel,
        costCenterId: v.costCenterId !== undefined ? v.costCenterId : target.costCenterId,
        active: body.active ?? target.active,
      })
      target.lockVersion++
      return { status: 200, json: userDto(target) }
    }

    // ---- cost centers & budgets ----
    if (path === '/cost-centers' && method === 'POST') {
      if (u.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Somente ADMIN pode criar centros de custo.')
      const errors: { field: string; message: string; code: string }[] = []
      if (typeof body.code !== 'string' || body.code.trim().length < 2 || body.code.length > 30)
        errors.push({ field: 'code', message: 'Código deve ter 2–30 caracteres', code: 'INVALID' })
      if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 120)
        errors.push({ field: 'name', message: 'Nome deve ter 2–120 caracteres', code: 'INVALID' })
      if (errors.length) fail(400, 'VALIDATION_FAILED', 'Um ou mais campos são inválidos.', { errors })
      if (db.costCenters.some((c) => c.code.toLowerCase() === body.code.toLowerCase()))
        fail(409, 'CODE_ALREADY_USED', `Código '${body.code}' já utilizado.`)
      const cc = { id: crypto.randomUUID(), code: body.code.trim(), name: body.name.trim(), active: true }
      db.costCenters.push(cc)
      return { status: 201, json: cc }
    }
    const budgetMatch = path.match(/^\/cost-centers\/([^/]+)\/budgets\/([^/]+)$/)
    if (budgetMatch) {
      const [, ccId, ym] = budgetMatch
      const cc = db.costCenters.find((c) => c.id === ccId)
      if (!cc) fail(404, 'NOT_FOUND', 'Centro de custo não encontrado.')
      if (!validYearMonth(ym)) fail(400, 'INVALID_MONTH_FORMAT', `Mês deve ser yyyy-mm; recebido '${ym}'.`)
      if (method === 'GET') {
        const b = db.budgets.find((x) => x.costCenterId === ccId && x.yearMonth === ym)
        return {
          status: 200,
          json: {
            costCenterId: ccId,
            yearMonth: ym,
            amount: centsToMoney(b?.amountCents ?? 0),
            consumed: centsToMoney(b?.consumedCents ?? 0),
            available: centsToMoney((b?.amountCents ?? 0) - (b?.consumedCents ?? 0)),
          },
        }
      }
      if (method === 'PUT') {
        if (u.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Somente ADMIN pode definir orçamentos.')
        const amount = moneyToCents(body.amount)
        if (!Number.isFinite(amount) || amount < 0)
          fail(400, 'VALIDATION_FAILED', 'Valor inválido.', {
            errors: [{ field: 'amount', message: 'Informe um valor ≥ 0 (ex.: 50000.00)', code: 'INVALID' }],
          })
        let b = db.budgets.find((x) => x.costCenterId === ccId && x.yearMonth === ym)
        if (b && amount < b.consumedCents)
          fail(
            422,
            'BUDGET_BELOW_CONSUMED',
            `Não é possível definir orçamento de R$ ${centsToMoney(amount)} abaixo do já consumido (R$ ${centsToMoney(b.consumedCents)}).`,
          )
        if (!b) {
          b = { costCenterId: ccId, yearMonth: ym, amountCents: amount, consumedCents: 0 }
          db.budgets.push(b)
        } else b.amountCents = amount
        return {
          status: 200,
          json: {
            costCenterId: ccId,
            yearMonth: ym,
            amount: centsToMoney(b.amountCents),
            consumed: centsToMoney(b.consumedCents),
            available: centsToMoney(b.amountCents - b.consumedCents),
          },
        }
      }
    }

    // ---- requests ----
    if (path === '/requests' && method === 'GET') {
      const list = applyFilters(db.requests, u, query)
      return { status: 200, json: page(list.map(summaryDto), query) }
    }
    if (path === '/requests' && method === 'POST') {
      const key = headers['idempotency-key']
      if (key) {
        const rec = db.idem.find((x) => x.userId === u.id && x.key === key)
        if (rec && rec.expiresAt > Date.now()) {
          if (rec.payloadHash !== hashPayload(body))
            fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'Idempotency-Key já utilizada com payload diferente.')
          return { status: rec.responseStatus, json: rec.responseBody }
        }
      }
      validateRequestPayload(body)
      const ccId = body.costCenterId ?? u.costCenterId
      if (!ccId)
        fail(400, 'VALIDATION_FAILED', 'costCenterId é obrigatório para usuários globais.', {
          errors: [{ field: 'costCenterId', message: 'Informe o centro de custo', code: 'REQUIRED' }],
        })
      const r: RequestRec = {
        id: crypto.randomUUID(),
        requestNumber: 'REQ-' + String(++db.seqRequestNumber).padStart(6, '0'),
        ownerId: u.id,
        costCenterId: ccId,
        status: 'DRAFT',
        currentVersion: 0,
        lockVersion: 1,
        title: body.title.trim(),
        description: body.description ?? null,
        category: body.category,
        neededBy: body.neededBy ?? null,
        items: toItems(body),
        versions: [],
        createdAt: new Date().toISOString(),
        submittedAt: null,
        decidedAt: null,
      }
      db.requests.push(r)
      addEvent(r, u, 'REQUEST_CREATED', null, 'DRAFT')
      const status = 201
      const json = detailDto(u, r)
      if (key)
        db.idem.push({
          userId: u.id,
          key,
          payloadHash: hashPayload(body),
          responseStatus: status,
          responseBody: json,
          expiresAt: Date.now() + 24 * 3600_000,
        })
      return { status, json }
    }
    if (path === '/approvals/inbox' && method === 'GET') return { status: 200, json: listInbox(u, query) }
    if (path === '/dashboard/summary' && method === 'GET') return { status: 200, json: dashboard(u) }

    if (seg[0] === 'requests' && seg[1]) {
      const id = seg[1]
      if (seg.length === 2 && method === 'GET') return { status: 200, json: detailDto(u, getVisible(u, id)) }
      if (seg.length === 2 && method === 'PUT') {
        const r = getVisible(u, id)
        if (r.ownerId !== u.id) fail(403, 'NOT_REQUEST_OWNER', 'Apenas o proprietário pode editar esta solicitação.')
        checkLock(r, body)
        if (r.status !== 'DRAFT' && r.status !== 'CHANGES_REQUESTED')
          fail(422, 'INVALID_TRANSITION', `Não é possível editar: a solicitação está em status ${r.status}.`)
        validateRequestPayload(body)
        r.title = body.title.trim()
        r.description = body.description ?? null
        r.category = body.category
        r.neededBy = body.neededBy ?? null
        r.costCenterId = body.costCenterId ?? u.costCenterId ?? r.costCenterId
        r.items = toItems(body)
        r.lockVersion++
        addEvent(r, u, 'EDITED', r.status, r.status)
        return { status: 200, json: detailDto(u, r) }
      }
      if (seg.length === 3 && seg[2] === 'versions' && method === 'GET') {
        const r = getVisible(u, id)
        return { status: 200, json: r.versions.map(versionDto) }
      }
      if (seg.length === 4 && seg[2] === 'versions' && method === 'GET') {
        const r = getVisible(u, id)
        const v = r.versions.find((x) => x.versionNumber === Number(seg[3]))
        if (!v) fail(404, 'NOT_FOUND', 'Versão não encontrada.')
        return { status: 200, json: versionDto(v) }
      }
      if (seg.length === 3 && seg[2] === 'history' && method === 'GET') {
        const r = getVisible(u, id)
        return {
          status: 200,
          json: db.events
            .filter((e) => e.requestId === r.id)
            .sort((a, b) => a.id - b.id)
            .map(eventDto),
        }
      }
      if (seg.length === 3 && method === 'POST') {
        const r = getVisible(u, id)
        if (seg[2] === 'submit') return { status: 200, json: doSubmit(u, r, body) }
        if (seg[2] === 'approve') return { status: 200, json: doDecide(u, r, 'APPROVE', body) }
        if (seg[2] === 'reject') return { status: 200, json: doDecide(u, r, 'REJECT', body) }
        if (seg[2] === 'request-changes') return { status: 200, json: doDecide(u, r, 'REQUEST_CHANGES', body) }
        if (seg[2] === 'cancel') return { status: 200, json: doCancel(u, r, body) }
      }
    }

    fail(404, 'NOT_FOUND', `Rota não encontrada: ${method} ${path}`)
  } catch (e) {
    if (e instanceof MockError) return e.response
    throw e
  }
}
