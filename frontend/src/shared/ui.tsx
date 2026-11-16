// Shared UI kit on top of antd 5: labels, tags, formatters, page header, error helpers.
import { Flex, Tag, Typography, type StepProps } from 'antd'
import type { ReactNode } from 'react'
import type { Category, RequestStatus, StepLevel, StepStatus } from './api/types'
import { ApiError } from './api/errors'

// ---------------- labels ----------------
export const STATUS_LABEL: Record<RequestStatus, string> = {
  DRAFT: 'Rascunho',
  PENDING_APPROVAL: 'Em aprovação',
  CHANGES_REQUESTED: 'Devolvida p/ ajuste',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
}
export const STATUSES = Object.keys(STATUS_LABEL) as RequestStatus[]

export const CATEGORY_LABEL: Record<Category, string> = {
  EQUIPMENT: 'Equipamento',
  SERVICES: 'Serviço',
  SUPPLIES: 'Suprimentos',
  TRAVEL: 'Viagem',
  SOFTWARE: 'Software',
  OTHER: 'Outro',
}
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[]
export const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))
export const statusOptions = STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))

export const stepLabel = (l: StepLevel) => (l === 'ADMIN' ? 'Admin' : l === 'NIVEL_1' ? 'Nível 1' : 'Nível 2')
export const roleLabel = (r: string) => (r === 'ADMIN' ? 'Admin' : r === 'APROVADOR' ? 'Aprovador' : 'Solicitante')

// ---------------- tags ----------------
const STATUS_COLOR: Record<RequestStatus, string> = {
  DRAFT: 'default',
  PENDING_APPROVAL: 'processing',
  CHANGES_REQUESTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
}
export function StatusTag({ status }: { status: RequestStatus }) {
  return (
    <Tag color={STATUS_COLOR[status]} bordered={false}>
      {STATUS_LABEL[status]}
    </Tag>
  )
}

const STEP_STATUS: Record<StepStatus, { label: string; color: string; antd: StepProps['status'] }> = {
  PENDING: { label: 'Pendente', color: 'default', antd: 'wait' },
  APPROVED: { label: 'Aprovada', color: 'success', antd: 'finish' },
  REJECTED: { label: 'Rejeitada', color: 'error', antd: 'error' },
  RETURNED: { label: 'Devolvida', color: 'warning', antd: 'error' },
  CANCELLED: { label: 'Cancelada', color: 'default', antd: 'error' },
  SKIPPED: { label: 'Não alcançada', color: 'default', antd: 'wait' },
}
export function StepTag({ status }: { status: StepStatus }) {
  return (
    <Tag color={STEP_STATUS[status].color} bordered={false}>
      {STEP_STATUS[status].label}
    </Tag>
  )
}
/** Maps a step to antd <Steps> status; the current pending step is "process". */
export const stepAntdStatus = (status: StepStatus, isCurrent: boolean): StepProps['status'] =>
  status === 'PENDING' && isCurrent ? 'process' : STEP_STATUS[status].antd

// ---------------- formatters ----------------
const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
/** Formats an API decimal string ("4899.90") without float drift (parsed as integer cents). */
export function moneyBRL(decimal: string | null | undefined): string {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec((decimal ?? '0').trim())
  if (!m) return '—'
  const cents = Number(m[2]) * 100 + Number(((m[3] ?? '') + '00').slice(0, 2))
  return brlFmt.format((m[1] ? -cents : cents) / 100)
}

const dtFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const dFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dtFmt.format(new Date(iso)) : '—')
export const fmtDate = (iso: string | null | undefined) =>
  iso ? dFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)) : '—'

// ---------------- errors ----------------
export const errText = (e: unknown) => (e instanceof ApiError ? e.detail : 'Falha inesperada. Tente novamente.')

/** "items[0].quantity" → ['items', 0, 'quantity'] for antd Form.setFields */
export function fieldPath(field: string): (string | number)[] {
  return field.split('.').flatMap((part) => {
    const m = part.match(/^([a-zA-Z]+)\[(\d+)\]$/)
    return m ? [m[1], Number(m[2])] : [part]
  })
}

/** Maps server 400 `errors[]` onto antd form fields (README §2.7 — server errors per field). */
export function serverFieldErrors(e: unknown): { name: (string | number)[]; errors: string[] }[] | null {
  if (!(e instanceof ApiError) || e.status !== 400 || !e.errors?.length) return null
  return e.errors.map((fe) => ({ name: fieldPath(fe.field), errors: [fe.message] }))
}

// ---------------- layout ----------------
export function PageHeader({ title, subtitle, extra }: { title: ReactNode; subtitle?: ReactNode; extra?: ReactNode }) {
  return (
    <Flex justify="space-between" align="flex-start" gap={16} wrap style={{ marginBottom: 16 }}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {subtitle && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
      </div>
      {extra}
    </Flex>
  )
}
