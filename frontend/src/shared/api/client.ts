// ApiClient — attaches auth + X-Request-Id, unwraps problem+json (INTEGRATION-CONTRACTS §1/§7).
import { USE_MOCK_BACKEND as USE_MOCK } from '../config'
import { notifyAuthExpired, problemFrom } from './errors'
import type {
  BudgetDto,
  CostCenterDto,
  DashboardSummaryDto,
  HealthDto,
  InboxItemDto,
  LoginResponse,
  Page,
  RequestDetailDto,
  RequestEventDto,
  RequestItemInput,
  RequestStatus,
  RequestSummaryDto,
  RequestVersionDto,
  UserDto,
} from './types'

// The fake backend is loaded lazily: when USE_MOCK is false at build time (production default — SEC-F04) the
// import below is dead code, so neither its rules nor its seed (fictional users + password) reach the bundle.
const loadMock = () => import('./mock/backend')

// E2E only: lets a Cypress test act as a *second* user against the same fake DB (e.g. to provoke a 409).
// Exposed only when the page runs inside Cypress and the mock backend is active.
if (USE_MOCK && typeof window !== 'undefined' && 'Cypress' in window) {
  ;(window as unknown as { __mockBackend: unknown }).__mockBackend = {
    handle: (req: Parameters<Awaited<ReturnType<typeof loadMock>>['mockHandle']>[0]) =>
      loadMock().then((m) => m.mockHandle(req)),
  }
}

export interface ReqOptions {
  body?: unknown
  query?: Record<string, string | number | undefined>
  headers?: Record<string, string>
  /** Public endpoint: never send the stored token (a stale token would turn a public call into a 401). */
  anonymous?: boolean
}

function qs(query?: ReqOptions['query']): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export function authHeaders(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem('kp_auth') // same key as AUTH_STORAGE_KEY in AuthContext
    return raw ? { Authorization: `Bearer ${(JSON.parse(raw) as { token: string }).token}` } : {}
  } catch {
    return {}
  }
}

async function request<T>(method: string, path: string, opts: ReqOptions = {}): Promise<T> {
  const requestId = crypto.randomUUID()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    ...(opts.anonymous ? {} : authHeaders()),
    ...opts.headers,
  }

  // A 401 from login/register means "wrong credentials", not "session expired".
  // Logout is exempt too: a 401 there just means the session is already gone (no expired-session loop).
  const isAuthCall =
    path.startsWith('/auth/login') || path.startsWith('/auth/register') || path.startsWith('/auth/logout')
  const fail = (status: number, body: unknown): never => {
    const err = problemFrom(status, body, requestId)
    if (err.status === 401 && !isAuthCall) notifyAuthExpired()
    throw err
  }

  if (USE_MOCK) {
    const { mockHandle } = await loadMock()
    const { status, json } = await mockHandle({
      method,
      path,
      query: new URLSearchParams(qs(opts.query).slice(1)),
      body: opts.body,
      headers,
    })
    if (status >= 400) fail(status, json)
    return json as T
  }

  const res = await fetch(`/api${path}${qs(opts.query)}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) fail(res.status, data)
  return data as T
}

// `type` (not `interface`) so it is assignable to the Record index signature of ReqOptions.query.
export type ListRequestsQuery = {
  page?: number
  size?: number
  sort?: string
  status?: RequestStatus
  category?: string
  costCenterId?: string
  createdFrom?: string
  createdTo?: string
  minAmount?: string
  maxAmount?: string
  q?: string
}

export const api = {
  register: (email: string, password: string, name: string, costCenterId: string) =>
    request<UserDto>('POST', '/auth/register', { body: { email, password, name, costCenterId } }),
  login: (email: string, password: string) =>
    request<LoginResponse>('POST', '/auth/login', { body: { email, password } }),
  me: () => request<UserDto>('GET', '/auth/me'),
  /** Ends the server-side (Redis) session of the current token (ADR-015). */
  logout: () => request<Record<string, never>>('POST', '/auth/logout'),
  health: () => request<HealthDto>('GET', '/health'),

  listUsers: (query: { page?: number; size?: number; role?: string; costCenterId?: string; q?: string } = {}) =>
    request<Page<UserDto>>('GET', '/users', { query }),
  createUser: (b: {
    email: string
    password: string
    name: string
    role: string
    approverLevel?: string | null
    costCenterId?: string | null
  }) => request<UserDto>('POST', '/users', { body: b }),
  updateUser: (id: string, b: Record<string, unknown>) => request<UserDto>('PATCH', `/users/${id}`, { body: b }),

  listCostCenters: () => request<CostCenterDto[]>('GET', '/cost-centers'),
  /** Sign-up form: the same public list, requested without credentials. */
  listPublicCostCenters: () => request<CostCenterDto[]>('GET', '/cost-centers', { anonymous: true }),
  createCostCenter: (code: string, name: string) =>
    request<CostCenterDto>('POST', '/cost-centers', { body: { code, name } }),
  getBudget: (ccId: string, ym: string) => request<BudgetDto>('GET', `/cost-centers/${ccId}/budgets/${ym}`),
  setBudget: (ccId: string, ym: string, amount: string) =>
    request<BudgetDto>('PUT', `/cost-centers/${ccId}/budgets/${ym}`, { body: { amount } }),

  listRequests: (query: ListRequestsQuery = {}) => request<Page<RequestSummaryDto>>('GET', '/requests', { query }),
  createRequest: (payload: unknown, idempotencyKey: string) =>
    request<RequestDetailDto>('POST', '/requests', { body: payload, headers: { 'Idempotency-Key': idempotencyKey } }),
  getRequest: (id: string) => request<RequestDetailDto>('GET', `/requests/${id}`),
  updateRequest: (id: string, payload: unknown) =>
    request<RequestDetailDto>('PUT', `/requests/${id}`, { body: payload }),
  listVersions: (id: string) => request<RequestVersionDto[]>('GET', `/requests/${id}/versions`),
  getVersion: (id: string, n: number) => request<RequestVersionDto>('GET', `/requests/${id}/versions/${n}`),
  history: (id: string) => request<RequestEventDto[]>('GET', `/requests/${id}/history`),
  submit: (id: string, lockVersion: number) =>
    request<RequestDetailDto>('POST', `/requests/${id}/submit`, { body: { lockVersion } }),
  approve: (id: string, lockVersion: number, comment?: string) =>
    request<RequestDetailDto>('POST', `/requests/${id}/approve`, { body: { lockVersion, comment } }),
  reject: (id: string, lockVersion: number, comment: string) =>
    request<RequestDetailDto>('POST', `/requests/${id}/reject`, { body: { lockVersion, comment } }),
  requestChanges: (id: string, lockVersion: number, comment: string) =>
    request<RequestDetailDto>('POST', `/requests/${id}/request-changes`, { body: { lockVersion, comment } }),
  cancel: (id: string, lockVersion: number) =>
    request<RequestDetailDto>('POST', `/requests/${id}/cancel`, { body: { lockVersion } }),

  inbox: (query: { page?: number; size?: number; sort?: string; costCenterId?: string } = {}) =>
    request<Page<InboxItemDto>>('GET', '/approvals/inbox', { query }),
  dashboard: () => request<DashboardSummaryDto>('GET', '/dashboard/summary'),
}

export type { RequestItemInput }
