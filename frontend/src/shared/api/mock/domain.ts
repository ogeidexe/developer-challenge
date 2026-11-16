// Domain helpers for the fake backend — mirrors backend/src/domain (ADR-005, BR-004/BR-005, BR-007).
import type { Category, StepLevel } from '../types'

export function uuid(): string {
  return crypto.randomUUID()
}

// ---- money: integer cents in, decimal string out (DATA-005) ----
export function moneyToCents(s: string | number): number {
  const str = String(s).trim()
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(str)) return NaN
  const [int, frac = ''] = str.split('.')
  return Number(int) * 100 + Number((frac + '00').slice(0, 2))
}

export function centsToMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function brl(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

// ---- business calendar (America/Sao_Paulo) ----
function spParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return { y: get('year'), m: get('month'), d: get('day') }
}

export function competenceMonth(d: Date): string {
  const { y, m } = spParts(d)
  return `${y}-${m}`
}

export function todaySP(): string {
  const { y, m, d } = spParts(new Date())
  return `${y}-${m}-${d}`
}

// ---- approval chain builder (BR-004, BR-005) ----
export function chainFor(totalCents: number, category: Category): StepLevel[] {
  let levels: StepLevel[]
  if (totalCents <= 100000) levels = ['NIVEL_1']
  else if (totalCents <= 1000000) levels = ['NIVEL_1', 'NIVEL_2']
  else levels = ['NIVEL_1', 'NIVEL_2', 'ADMIN']
  if (category === 'SOFTWARE' && !levels.includes('ADMIN')) levels.push('ADMIN')
  return levels
}

export function isFutureDate(yyyyMmDd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd) && yyyyMmDd > todaySP()
}

export function validYearMonth(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym)
}

/** Canonical JSON: object keys sorted at every depth (ADR-010). */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

export function hashPayload(body: unknown): string {
  // non-cryptographic hash is enough for the fake backend; the real backend uses sha256
  const s = canonical(body)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return 'h' + Math.abs(h).toString(36)
}
