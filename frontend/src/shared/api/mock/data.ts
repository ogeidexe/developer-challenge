// In-memory data model + seed fixtures (README §5.4, A-33: consumed backed by APPROVED requests).
import type { ApproverLevel, Category, RequestStatus, Role, StepLevel, StepStatus } from '../types'
import { chainFor, competenceMonth, moneyToCents, uuid } from './domain'

export interface UserRec {
  id: string; email: string; password: string; name: string
  role: Role; approverLevel: ApproverLevel | null; costCenterId: string | null
  active: boolean; lockVersion: number; createdAt: string
}
export interface CcRec { id: string; code: string; name: string; active: boolean }
export interface BudgetRec { costCenterId: string; yearMonth: string; amountCents: number; consumedCents: number }
export interface ItemRec { position: number; description: string; quantity: number; unitPriceCents: number; lineTotalCents: number }
export interface StepRec {
  sequence: number; level: StepLevel; status: StepStatus
  approverId: string | null; decidedAt: string | null; comment: string | null
}
export interface VersionRec {
  versionNumber: number; title: string; description: string | null; category: Category
  costCenterId: string; neededBy: string | null; totalCents: number; competenceMonth: string
  submittedBy: string; submittedAt: string; items: ItemRec[]; steps: StepRec[]
}
export interface RequestRec {
  id: string; requestNumber: string; ownerId: string; costCenterId: string; status: RequestStatus
  currentVersion: number; lockVersion: number
  title: string; description: string | null; category: Category; neededBy: string | null
  items: ItemRec[]; versions: VersionRec[]
  createdAt: string; submittedAt: string | null; decidedAt: string | null
}
export interface EventRec {
  id: number; requestId: string; actorId: string | null; actorRole: Role; action: string
  fromStatus: RequestStatus | null; toStatus: RequestStatus | null
  stepLevel: StepLevel | null; stepSequence: number | null; versionNumber: number
  comment: string | null; xRequestId: string; occurredAt: string
}
export interface IdemRec { userId: string; key: string; payloadHash: string; responseStatus: number; responseBody: unknown; expiresAt: number }

export interface MockDb {
  users: UserRec[]; costCenters: CcRec[]; budgets: BudgetRec[]
  requests: RequestRec[]; events: EventRec[]; idem: IdemRec[]
  seqRequestNumber: number; seqEvent: number
}

const HOUR = 3_600_000

function items(...list: [string, number, string][]): ItemRec[] {
  return list.map(([description, quantity, unitPrice], position) => {
    const unitPriceCents = moneyToCents(unitPrice)
    return { position, description, quantity, unitPriceCents, lineTotalCents: unitPriceCents * quantity }
  })
}
const totalOf = (list: ItemRec[]) => list.reduce((s, i) => s + i.lineTotalCents, 0)

export function seed(): MockDb {
  const now = Date.now()
  const ago = (hours: number) => new Date(now - hours * HOUR).toISOString()
  const month = competenceMonth(new Date(now))

  const ccTi: CcRec = { id: uuid(), code: 'CC-TI-01', name: 'Tecnologia da Informação', active: true }
  const ccAdm: CcRec = { id: uuid(), code: 'CC-ADM-02', name: 'Administrativo', active: true }
  const PWD = 'Kingspan@123'
  const mkUser = (email: string, name: string, role: Role, level: ApproverLevel | null, cc: CcRec | null): UserRec =>
    ({ id: uuid(), email, password: PWD, name, role, approverLevel: level, costCenterId: cc?.id ?? null, active: true, lockVersion: 1, createdAt: ago(24 * 30) })

  const users: UserRec[] = [
    mkUser('solic.ti@kingspan.test', 'Sofia Lima', 'SOLICITANTE', null, ccTi),
    mkUser('aprov1.ti@kingspan.test', 'João Nunes', 'APROVADOR', 'NIVEL_1', ccTi),
    mkUser('aprov2.ti@kingspan.test', 'Maria Souza', 'APROVADOR', 'NIVEL_2', ccTi),
    mkUser('solic.adm@kingspan.test', 'Carlos Reis', 'SOLICITANTE', null, ccAdm),
    mkUser('aprov1.adm@kingspan.test', 'Ana Costa', 'APROVADOR', 'NIVEL_1', ccAdm),
    mkUser('aprov2.adm@kingspan.test', 'Pedro Alves', 'APROVADOR', 'NIVEL_2', ccAdm),
    mkUser('admin1@kingspan.test', 'Admin Um', 'ADMIN', null, null),
    mkUser('admin2@kingspan.test', 'Admin Dois', 'ADMIN', null, null),
  ]
  const [sTi, a1Ti, a2Ti, sAdm, a1Adm, a2Adm, adm1, adm2] = users

  // A-33: consumed = sum of this month's seeded APPROVED requests (r5 = 49.200,00; r8 = 12.000,00)
  const budgets: BudgetRec[] = [
    { costCenterId: ccTi.id, yearMonth: month, amountCents: moneyToCents('50000.00'), consumedCents: moneyToCents('49200.00') },
    { costCenterId: ccAdm.id, yearMonth: month, amountCents: moneyToCents('80000.00'), consumedCents: moneyToCents('12000.00') },
  ]

  const requests: RequestRec[] = []
  const events: EventRec[] = []
  let seqN = 0
  let seqEv = 0

  /** One approval decision in the seeded history: who, when (hours ago) and an optional comment. */
  type Decision = { by: UserRec; at: number; comment?: string }

  interface SeedSpec {
    owner: UserRec; cc: CcRec; title: string; description: string; category: Category
    neededBy?: string | null; items: ItemRec[]
    createdAt: number                 // hours ago
    submittedAt?: number              // hours ago; omitted = never submitted (DRAFT / cancelled draft)
    approvals?: Decision[]            // approved steps, in chain order
    stop?: Decision & { as: 'REJECTED' | 'RETURNED' }  // decision on the step after the approvals
    workingCopy?: ItemRec[]           // CHANGES_REQUESTED: edited items not yet resubmitted
    cancelledDraftAt?: number
  }

  function add(spec: SeedSpec): RequestRec {
    const r: RequestRec = {
      id: uuid(), requestNumber: 'REQ-' + String(++seqN).padStart(6, '0'),
      ownerId: spec.owner.id, costCenterId: spec.cc.id, status: 'DRAFT', currentVersion: 0, lockVersion: 1,
      title: spec.title, description: spec.description, category: spec.category, neededBy: spec.neededBy ?? null,
      items: spec.workingCopy ?? spec.items, versions: [],
      createdAt: ago(spec.createdAt), submittedAt: null, decidedAt: null,
    }
    const ev = (actor: UserRec, action: string, from: RequestStatus | null, to: RequestStatus | null, at: number,
      o: { comment?: string | null; step?: StepRec } = {}) => {
      events.push({
        id: ++seqEv, requestId: r.id, actorId: actor.id, actorRole: actor.role, action, fromStatus: from, toStatus: to,
        stepLevel: o.step?.level ?? null, stepSequence: o.step?.sequence ?? null, versionNumber: r.currentVersion,
        comment: o.comment ?? null, xRequestId: `seed-${seqEv}`, occurredAt: ago(at),
      })
      r.lockVersion++
    }

    events.push({
      id: ++seqEv, requestId: r.id, actorId: spec.owner.id, actorRole: spec.owner.role, action: 'REQUEST_CREATED',
      fromStatus: null, toStatus: 'DRAFT', stepLevel: null, stepSequence: null, versionNumber: 0, comment: null,
      xRequestId: `seed-${seqEv}`, occurredAt: ago(spec.createdAt),
    })

    if (spec.cancelledDraftAt != null) {
      r.status = 'CANCELLED'; r.decidedAt = ago(spec.cancelledDraftAt)
      ev(spec.owner, 'CANCELLED', 'DRAFT', 'CANCELLED', spec.cancelledDraftAt)
    }
    if (spec.submittedAt == null) { requests.push(r); return r }

    // submit → freeze v1 with a chain built from total + category (BR-004/BR-005)
    const total = totalOf(spec.items)
    const v: VersionRec = {
      versionNumber: 1, title: spec.title, description: spec.description, category: spec.category,
      costCenterId: spec.cc.id, neededBy: spec.neededBy ?? null, totalCents: total,
      competenceMonth: competenceMonth(new Date(now - spec.submittedAt * HOUR)),
      submittedBy: spec.owner.id, submittedAt: ago(spec.submittedAt), items: spec.items,
      steps: chainFor(total, spec.category).map((level, i) => ({ sequence: i + 1, level, status: 'PENDING', approverId: null, decidedAt: null, comment: null })),
    }
    r.versions.push(v); r.currentVersion = 1; r.status = 'PENDING_APPROVAL'; r.submittedAt = v.submittedAt
    ev(spec.owner, 'SUBMITTED', 'DRAFT', 'PENDING_APPROVAL', spec.submittedAt)

    ;(spec.approvals ?? []).forEach((d, i) => {
      const step = v.steps[i]
      Object.assign(step, { status: 'APPROVED', approverId: d.by.id, decidedAt: ago(d.at), comment: d.comment ?? null })
      const last = i === v.steps.length - 1
      if (last) { r.status = 'APPROVED'; r.decidedAt = ago(d.at) }
      ev(d.by, 'APPROVED', 'PENDING_APPROVAL', last ? 'APPROVED' : 'PENDING_APPROVAL', d.at, { comment: d.comment, step })
    })

    if (spec.stop) {
      const step = v.steps[(spec.approvals ?? []).length]
      Object.assign(step, { status: spec.stop.as, approverId: spec.stop.by.id, decidedAt: ago(spec.stop.at), comment: spec.stop.comment ?? null })
      for (const s of v.steps) if (s.sequence > step.sequence) s.status = 'SKIPPED' // A-31
      const to: RequestStatus = spec.stop.as === 'REJECTED' ? 'REJECTED' : 'CHANGES_REQUESTED'
      r.status = to
      if (to === 'REJECTED') r.decidedAt = ago(spec.stop.at)
      ev(spec.stop.by, to === 'REJECTED' ? 'REJECTED' : 'CHANGES_REQUESTED', 'PENDING_APPROVAL', to, spec.stop.at, { comment: spec.stop.comment, step })
      if (spec.workingCopy) ev(spec.owner, 'EDITED', to, to, spec.stop.at - 1)
    }
    requests.push(r)
    return r
  }

  // 1) TI · DRAFT
  add({ owner: sTi, cc: ccTi, title: 'Monitores para o time de suporte', description: 'Trocar 8 monitores antigos.',
    category: 'EQUIPMENT', items: items(['Monitor 24"', 8, '899.90']), createdAt: 24 })

  // 2) TI · pending at N1 — R$ 900,00 → [N1]. Approving it shows BUDGET_EXCEEDED (only R$ 800,00 left in CC-TI-01)
  add({ owner: sTi, cc: ccTi, title: 'Kit periféricos estoque', description: 'Reposição de periféricos.',
    category: 'SUPPLIES', neededBy: '2026-12-20', items: items(['Teclado e mouse sem fio', 10, '90.00']),
    createdAt: 30, submittedAt: 5 })

  // 3) TI · pending at N2 — R$ 5.000,00 → [N1, N2]
  add({ owner: sTi, cc: ccTi, title: 'Switch rede predial', description: 'Upgrade do backbone.',
    category: 'EQUIPMENT', items: items(['Switch gerenciável 48 portas', 1, '5000.00']),
    createdAt: 50, submittedAt: 20, approvals: [{ by: a1Ti, at: 18, comment: 'Dentro do planejado.' }] })

  // 4) TI · CHANGES_REQUESTED — SOFTWARE v1 returned at N1; owner already edited the working copy (35 licenses)
  add({ owner: sTi, cc: ccTi, title: 'Antivírus corporativo', description: 'Renovação anual.',
    category: 'SOFTWARE', items: items(['Licença anual de antivírus corporativo', 40, '120.00']),
    workingCopy: items(['Licença anual de antivírus corporativo', 35, '120.00']),
    createdAt: 70, submittedAt: 26,
    stop: { as: 'RETURNED', by: a1Ti, at: 24, comment: 'Reduzir para 35 licenças e detalhar justificativa.' } })

  // 5) TI · APPROVED R$ 49.200,00 — backs the near-exhausted CC-TI-01 budget
  add({ owner: sTi, cc: ccTi, title: 'Servidor virtualização', description: 'Host principal do cluster.',
    category: 'EQUIPMENT', items: items(['Servidor para virtualização', 1, '49200.00']),
    createdAt: 96, submittedAt: 48,
    approvals: [{ by: a1Ti, at: 40 }, { by: a2Ti, at: 30 }, { by: adm1, at: 10, comment: 'Orçamento aprovado no plano anual.' }] })

  // 6) TI · REJECTED at N1 (later steps SKIPPED)
  add({ owner: sTi, cc: ccTi, title: 'Drone inspeção', description: 'Inspeção de telhados.',
    category: 'EQUIPMENT', items: items(['Drone para inspeção externa', 1, '15000.00']),
    createdAt: 40, submittedAt: 30,
    stop: { as: 'REJECTED', by: a1Ti, at: 24, comment: 'Fora do escopo aprovado para este semestre.' } })

  // 7) ADM · pending at ADMIN — R$ 24.499,50 → [N1, N2, ADMIN] (video flow: approve as admin1/admin2)
  add({ owner: sAdm, cc: ccAdm, title: 'Notebooks para o time de TI', description: 'Substituição de 5 equipamentos com mais de 5 anos.',
    category: 'EQUIPMENT', neededBy: '2026-12-01', items: items(['Notebook 16GB/512GB', 5, '4899.90']),
    createdAt: 8, submittedAt: 6,
    approvals: [{ by: a1Adm, at: 4, comment: 'De acordo com o inventário.' }, { by: a2Adm, at: 2, comment: 'Dentro do planejado do trimestre.' }] })

  // 8) ADM · APPROVED R$ 12.000,00 — backs CC-ADM-02 consumed
  add({ owner: sAdm, cc: ccAdm, title: 'Climatização sala de reunião', description: 'Conforto térmico.',
    category: 'SERVICES', items: items(['Ar-condicionado 12000 BTU', 2, '6000.00']),
    createdAt: 120, submittedAt: 72,
    approvals: [{ by: a1Adm, at: 60 }, { by: a2Adm, at: 48 }, { by: adm2, at: 36, comment: 'Orçamento disponível.' }] })

  // 9) ADM · CANCELLED while still a draft
  add({ owner: sAdm, cc: ccAdm, title: 'Projetor multimídia', description: 'Sala de treinamento.',
    category: 'EQUIPMENT', items: items(['Projetor multimídia', 1, '4500.00']), createdAt: 20, cancelledDraftAt: 12 })

  // 10) ADM · SOFTWARE pending at N1 — R$ 3.000,00 → [N1, N2] + ADMIN (SOFTWARE rule)
  add({ owner: sAdm, cc: ccAdm, title: 'Plataforma e-sign', description: 'Assinatura digital de contratos.',
    category: 'SOFTWARE', items: items(['Assinatura anual plataforma de e-sign', 1, '3000.00']),
    createdAt: 2, submittedAt: 0.75 })

  return { users, costCenters: [ccTi, ccAdm], budgets, requests, events, idem: [], seqRequestNumber: seqN, seqEvent: seqEv }
}
