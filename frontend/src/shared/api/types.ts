// DTO types mirroring docs/api/openapi.yaml (the frozen contract).
export type Role = 'SOLICITANTE' | 'APROVADOR' | 'ADMIN'
export type ApproverLevel = 'NIVEL_1' | 'NIVEL_2'
export type StepLevel = 'NIVEL_1' | 'NIVEL_2' | 'ADMIN'
export type RequestStatus =
  | 'DRAFT' | 'PENDING_APPROVAL' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
export type Category = 'EQUIPMENT' | 'SERVICES' | 'SUPPLIES' | 'TRAVEL' | 'SOFTWARE' | 'OTHER'
// A-31: the deciding step records the outcome; later steps of a closed version become SKIPPED.
export type StepStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED' | 'CANCELLED' | 'SKIPPED'
export type AllowedAction = 'EDIT' | 'SUBMIT' | 'CANCEL' | 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'

export interface UserDto {
  id: string
  email: string
  name: string
  role: Role
  approverLevel: ApproverLevel | null
  costCenterId: string | null
  active: boolean
  createdAt: string
  lockVersion?: number
}

export interface RefDto { id: string; name?: string; code?: string }

export interface LoginResponse {
  token: string
  tokenType: string
  expiresIn: number
  user: UserDto
}

export interface CostCenterDto { id: string; code: string; name: string; active: boolean }

export interface BudgetDto {
  costCenterId: string
  yearMonth: string
  amount: string
  consumed: string
  available: string
}

export interface RequestItemInput { description: string; quantity: number; unitPrice: string }

export interface ItemDto {
  position: number
  description: string
  quantity: number
  unitPrice: string
  lineTotal: string
}

export interface ApprovalStepDto {
  sequence: number
  level: StepLevel
  status: StepStatus
  approver: { id: string; name: string } | null
  decidedAt: string | null
  comment: string | null
}

export interface RequestSummaryDto {
  id: string
  requestNumber: string
  title: string
  category: Category
  status: RequestStatus
  total: string
  owner: { id: string; name: string }
  costCenter: { id: string; code: string }
  currentVersion: number
  neededBy: string | null
  createdAt: string
  submittedAt: string | null
}

export interface RequestDetailDto extends RequestSummaryDto {
  description: string | null
  competenceMonth: string | null
  decidedAt: string | null
  items: ItemDto[]
  steps: ApprovalStepDto[]
  versions: { versionNumber: number; submittedAt: string }[]
  allowedActions: AllowedAction[]
  lockVersion: number
}

export interface RequestVersionDto {
  versionNumber: number
  title: string
  description: string | null
  category: Category
  costCenter: { id: string; code: string }
  neededBy: string | null
  total: string
  competenceMonth: string
  submittedAt: string
  submittedBy: { id: string; name: string }
  items: ItemDto[]
  steps: ApprovalStepDto[]
}

export interface RequestEventDto {
  id: number
  actor: { id: string; name: string } | null
  actorRole: Role
  action: string
  fromStatus: RequestStatus | null
  toStatus: RequestStatus | null
  stepLevel: StepLevel | null
  stepSequence: number | null
  versionNumber: number
  comment: string | null
  xRequestId: string
  occurredAt: string
}

export interface InboxItemDto extends RequestSummaryDto { currentStep: ApprovalStepDto }

export interface Page<T> {
  data: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface DashboardSummaryDto {
  totals: { status: RequestStatus; count: number }[]
  budgets: {
    costCenterId: string
    code: string
    name: string
    month: string
    amount: string
    consumed: string
    available: string
  }[]
  averageApprovalTimeDays: number | null
}

export interface HealthDto { status: 'UP' | 'DOWN'; db: 'UP' | 'DOWN'; timestamp: string }

export interface FieldError { field: string; message: string; code: string }

export interface ProblemDetail {
  type: string
  title: string
  status: number
  detail: string
  code: string
  requestId: string
  currentLockVersion?: number | null
  errors?: FieldError[] | null
}
