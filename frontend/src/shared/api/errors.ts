import type { ProblemDetail } from './types'

export class ApiError extends Error {
  status: number
  code: string
  detail: string
  requestId: string
  errors?: { field: string; message: string; code: string }[] | null
  currentLockVersion?: number | null

  constructor(p: ProblemDetail) {
    super(p.detail)
    this.status = p.status
    this.code = p.code
    this.detail = p.detail
    this.requestId = p.requestId
    this.errors = p.errors
    this.currentLockVersion = p.currentLockVersion ?? null
  }

  /** map of field -> first message (for form rendering) */
  fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const e of this.errors ?? []) if (!map[e.field]) map[e.field] = e.message
    return map
  }
}

const AUTH_EXPIRED_EVENT = 'kp:auth-expired'
export function notifyAuthExpired(): void { window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT)) }
export function onAuthExpired(fn: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, fn)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, fn)
}

export function problemFrom(status: number, body: unknown, requestId: string): ApiError {
  const b = (body ?? {}) as Partial<ProblemDetail>
  return new ApiError({
    type: b.type ?? 'https://kingspan.example/problems/internal',
    title: b.title ?? 'Erro',
    status,
    detail: b.detail ?? 'Erro inesperado.',
    code: b.code ?? 'INTERNAL',
    requestId: b.requestId ?? requestId,
    currentLockVersion: b.currentLockVersion ?? null,
    errors: b.errors ?? null,
  })
}
