import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Result,
  Row,
  Segmented,
  Space,
  Steps,
  Table,
  Timeline,
  Typography,
} from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  RollbackOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import type { AllowedAction, ItemDto, RequestEventDto } from '../../shared/api/types'
import {
  CATEGORY_LABEL,
  PageHeader,
  STATUS_LABEL,
  StatusTag,
  StepTag,
  errText,
  fmtDate,
  fmtDateTime,
  moneyBRL,
  stepAntdStatus,
  stepLabel,
} from '../../shared/ui'

type Decision = Extract<AllowedAction, 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'>

const DECISION: Record<
  Decision,
  { title: string; okText: string; needsComment: boolean; danger: boolean; done: string }
> = {
  APPROVE: {
    title: 'Aprovar etapa atual',
    okText: 'Aprovar',
    needsComment: false,
    danger: false,
    done: 'Etapa aprovada.',
  },
  REJECT: {
    title: 'Rejeitar solicitação',
    okText: 'Rejeitar',
    needsComment: true,
    danger: true,
    done: 'Solicitação rejeitada.',
  },
  REQUEST_CHANGES: {
    title: 'Devolver para ajuste',
    okText: 'Devolver',
    needsComment: true,
    danger: true,
    done: 'Solicitação devolvida para ajuste.',
  },
}

const EVENT_LABEL: Record<string, string> = {
  REQUEST_CREATED: 'Criada',
  EDITED: 'Editada',
  SUBMITTED: 'Submetida',
  RESUBMITTED: 'Reenviada (nova versão)',
  APPROVED: 'Etapa aprovada',
  APPROVAL_FAILED_BUDGET: 'Aprovação recusada — orçamento insuficiente',
  REJECTED: 'Rejeitada',
  CHANGES_REQUESTED: 'Devolvida para ajuste',
  CANCELLED: 'Cancelada',
}
function eventColor(e: RequestEventDto): string {
  if (e.action === 'APPROVED') return e.toStatus === 'APPROVED' ? 'green' : 'blue'
  if (e.action === 'APPROVAL_FAILED_BUDGET' || e.action === 'REJECTED') return 'red'
  if (e.action === 'CHANGES_REQUESTED') return 'orange'
  if (e.action === 'SUBMITTED' || e.action === 'RESUBMITTED') return 'blue'
  return 'gray'
}

function ItemsTable({ items }: { items: ItemDto[] }) {
  return (
    <Table<ItemDto>
      size="small"
      rowKey="position"
      pagination={false}
      dataSource={items}
      scroll={{ x: 560 }}
      columns={[
        { title: '#', dataIndex: 'position', width: 48, render: (p: number) => p + 1 },
        { title: 'Descrição', dataIndex: 'description' },
        { title: 'Qtd.', dataIndex: 'quantity', align: 'right', width: 80 },
        {
          title: 'Preço unit.',
          dataIndex: 'unitPrice',
          align: 'right',
          width: 130,
          render: (v: string) => moneyBRL(v),
        },
        { title: 'Subtotal', dataIndex: 'lineTotal', align: 'right', width: 140, render: (v: string) => moneyBRL(v) },
      ]}
    />
  )
}

export function RequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { message } = App.useApp()
  const [decision, setDecision] = useState<Decision | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [versionNo, setVersionNo] = useState<number | null>(null)
  const [decisionForm] = Form.useForm<{ comment?: string }>()

  const {
    data: r,
    isLoading,
    error,
  } = useQuery({ queryKey: ['request', id], queryFn: () => api.getRequest(id!), retry: false })
  const { data: history } = useQuery({
    queryKey: ['history', id],
    queryFn: () => api.history(id!),
    enabled: Boolean(r),
  })
  const { data: versions } = useQuery({
    queryKey: ['versions', id],
    queryFn: () => api.listVersions(id!),
    enabled: Boolean(r && r.currentVersion > 0),
  })

  const shownVersionNo = versionNo ?? r?.currentVersion ?? 0
  const version = versions?.find((v) => v.versionNumber === shownVersionNo)
  const isEditable = r?.status === 'DRAFT' || r?.status === 'CHANGES_REQUESTED'

  const refresh = () =>
    Promise.all(
      [['request', id], ['history', id], ['versions', id], ['requests'], ['inbox'], ['dashboard']].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    )

  const transition = useMutation({
    mutationFn: ({ action, comment }: { action: AllowedAction; comment?: string }) => {
      const lv = r!.lockVersion // the API rejects a stale value with 409 (README §3.2)
      switch (action) {
        case 'SUBMIT':
          return api.submit(id!, lv)
        case 'CANCEL':
          return api.cancel(id!, lv)
        case 'APPROVE':
          return api.approve(id!, lv, comment || undefined)
        case 'REJECT':
          return api.reject(id!, lv, comment ?? '')
        default:
          return api.requestChanges(id!, lv, comment ?? '')
      }
    },
    onSuccess: async (_d, { action }) => {
      message.success(
        action === 'SUBMIT'
          ? 'Solicitação submetida.'
          : action === 'CANCEL'
            ? 'Solicitação cancelada.'
            : DECISION[action as Decision].done,
      )
      setDecision(null)
      setConflict(null)
      setVersionNo(null)
      await refresh()
    },
    onError: async (e, { action }) => {
      if (e instanceof ApiError && e.status === 409) {
        // someone acted first: close the modal, explain, reload state + allowedActions
        setDecision(null)
        setConflict(`${e.detail} Os dados foram atualizados — confira o novo estado antes de agir.`)
        await refresh()
      } else if (e instanceof ApiError && e.status === 422 && action in DECISION) {
        setDecisionError(e.detail) // keep the modal open with the server's explanation (README §4.3)
        await refresh() // e.g. APPROVAL_FAILED_BUDGET appears in the timeline
      } else {
        setDecision(null)
        message.error(errText(e))
        await refresh()
      }
    },
  })

  if (isLoading) return <Card loading style={{ minHeight: 400 }} />
  if (error || !r) {
    return (
      <Result
        status="404"
        title="Solicitação não encontrada"
        subTitle={errText(error)}
        extra={
          <Button type="primary" onClick={() => navigate('/requests')}>
            Voltar à lista
          </Button>
        }
      />
    )
  }

  const acts = r.allowedActions
  const openDecision = (d: Decision) => {
    setDecisionError(null)
    setDecision(d)
  }
  const currentSeq =
    r.status === 'PENDING_APPROVAL' ? version?.steps.find((s) => s.status === 'PENDING')?.sequence : undefined

  // Buttons are rendered ONLY from allowedActions — no permission rule lives in the front-end (README §2.7)
  const actionBar = (
    <Space wrap>
      {acts.includes('EDIT') && (
        <Button icon={<EditOutlined />} onClick={() => navigate(`/requests/${r.id}/edit`)}>
          Editar
        </Button>
      )}
      {acts.includes('SUBMIT') && (
        <Popconfirm
          title={r.currentVersion > 0 ? 'Reenviar como nova versão?' : 'Submeter para aprovação?'}
          description="A cadeia de aprovação é montada a partir do valor e da categoria."
          okText="Submeter"
          cancelText="Voltar"
          onConfirm={() => transition.mutate({ action: 'SUBMIT' })}
        >
          <Button type="primary" icon={<SendOutlined />} loading={transition.isPending}>
            {r.currentVersion > 0 ? `Reenviar (v${r.currentVersion + 1})` : 'Submeter'}
          </Button>
        </Popconfirm>
      )}
      {acts.includes('APPROVE') && (
        <Button type="primary" icon={<CheckOutlined />} onClick={() => openDecision('APPROVE')}>
          Aprovar
        </Button>
      )}
      {acts.includes('REQUEST_CHANGES') && (
        <Button icon={<RollbackOutlined />} onClick={() => openDecision('REQUEST_CHANGES')}>
          Devolver p/ ajuste
        </Button>
      )}
      {acts.includes('REJECT') && (
        <Button danger icon={<CloseOutlined />} onClick={() => openDecision('REJECT')}>
          Rejeitar
        </Button>
      )}
      {acts.includes('CANCEL') && (
        <Popconfirm
          title="Cancelar esta solicitação?"
          description="Cancelada é um estado final."
          okText="Cancelar solicitação"
          okButtonProps={{ danger: true }}
          cancelText="Voltar"
          onConfirm={() => transition.mutate({ action: 'CANCEL' })}
        >
          <Button danger type="text" icon={<StopOutlined />}>
            Cancelar
          </Button>
        </Popconfirm>
      )}
    </Space>
  )

  return (
    <>
      <PageHeader
        title={
          <Space>
            {r.requestNumber}
            {r.currentVersion > 0 && <Typography.Text type="secondary">v{r.currentVersion}</Typography.Text>}
            <StatusTag status={r.status} />
          </Space>
        }
        subtitle={r.title}
        extra={<Button onClick={() => navigate('/requests')}>Voltar</Button>}
      />

      {conflict && (
        <Alert
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          message="Alguém agiu antes de você (409)"
          description={conflict}
          onClose={() => setConflict(null)}
        />
      )}

      <Card style={{ marginBottom: 16 }}>
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={[
            { key: 'cat', label: 'Categoria', children: CATEGORY_LABEL[r.category] },
            { key: 'cc', label: 'Centro de custo', children: r.costCenter.code },
            { key: 'owner', label: 'Solicitante', children: r.owner.name },
            { key: 'total', label: 'Total', children: <strong>{moneyBRL(r.total)}</strong> },
            { key: 'comp', label: 'Competência', children: r.competenceMonth ?? '—' },
            { key: 'need', label: 'Necessário até', children: fmtDate(r.neededBy) },
            { key: 'created', label: 'Criada em', children: fmtDateTime(r.createdAt) },
            { key: 'submitted', label: 'Submetida em', children: fmtDateTime(r.submittedAt) },
            { key: 'decided', label: 'Decidida em', children: fmtDateTime(r.decidedAt) },
            ...(r.description ? [{ key: 'desc', label: 'Descrição', children: r.description, span: 3 }] : []),
          ]}
        />
        <Flex justify="space-between" align="center" wrap gap={8} style={{ marginTop: 12 }}>
          {acts.length ? (
            actionBar
          ) : (
            <Typography.Text type="secondary">Nenhuma ação disponível para você neste status.</Typography.Text>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            lockVersion {r.lockVersion}
          </Typography.Text>
        </Flex>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={15}>
          {isEditable && (
            <Card
              title={
                r.status === 'DRAFT'
                  ? 'Itens (rascunho)'
                  : `Itens da próxima versão (v${r.currentVersion + 1}, ainda não enviada)`
              }
              style={{ marginBottom: 16 }}
            >
              <ItemsTable items={r.items} />
            </Card>
          )}

          <Card
            title="Cadeia de aprovação"
            style={{ marginBottom: 16 }}
            extra={
              (versions?.length ?? 0) > 1 && (
                <Segmented<number>
                  size="small"
                  value={shownVersionNo}
                  onChange={setVersionNo}
                  options={(versions ?? []).map((v) => ({ value: v.versionNumber, label: `v${v.versionNumber}` }))}
                />
              )
            }
          >
            {version ? (
              <>
                <Typography.Paragraph type="secondary">
                  Versão {version.versionNumber} · {moneyBRL(version.total)} · {version.costCenter.code} · competência{' '}
                  {version.competenceMonth}
                  {version.versionNumber !== r.currentVersion && ' · versão anterior (imutável)'}
                </Typography.Paragraph>
                <Steps
                  size="small"
                  style={{ marginBottom: 20 }}
                  items={version.steps.map((s) => ({
                    status: stepAntdStatus(
                      s.status,
                      s.sequence === currentSeq && version.versionNumber === r.currentVersion,
                    ),
                    title: stepLabel(s.level),
                    description: (
                      <Flex vertical gap={2}>
                        <span>
                          <StepTag status={s.status} />
                        </span>
                        {s.approver && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {s.approver.name} · {fmtDateTime(s.decidedAt)}
                          </Typography.Text>
                        )}
                        {s.comment && (
                          <Typography.Text italic style={{ fontSize: 12 }}>
                            “{s.comment}”
                          </Typography.Text>
                        )}
                      </Flex>
                    ),
                  }))}
                />
                <ItemsTable items={version.items} />
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="A cadeia é montada quando a solicitação é submetida."
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Card title="Histórico">
            {history?.length ? (
              <Timeline
                items={history.map((e) => ({
                  color: eventColor(e),
                  children: (
                    <Flex vertical gap={2}>
                      <Typography.Text strong>{EVENT_LABEL[e.action] ?? e.action}</Typography.Text>
                      <Typography.Text style={{ fontSize: 12 }}>
                        {e.actor?.name ?? 'Sistema'} ({e.actorRole}) · v{e.versionNumber}
                        {e.stepLevel ? ` · ${stepLabel(e.stepLevel)}` : ''}
                      </Typography.Text>
                      {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {STATUS_LABEL[e.fromStatus]} → {STATUS_LABEL[e.toStatus]}
                        </Typography.Text>
                      )}
                      {e.comment && (
                        <Typography.Text italic type="secondary" style={{ fontSize: 12 }}>
                          “{e.comment}”
                        </Typography.Text>
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {fmtDateTime(e.occurredAt)} · req {e.xRequestId.slice(0, 8)}
                      </Typography.Text>
                    </Flex>
                  ),
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sem eventos" />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        open={decision !== null}
        title={decision && DECISION[decision].title}
        okText={decision && DECISION[decision].okText}
        okButtonProps={{ danger: decision ? DECISION[decision].danger : false }}
        cancelText="Voltar"
        confirmLoading={transition.isPending}
        onOk={() => decisionForm.submit()}
        onCancel={() => setDecision(null)}
        destroyOnClose
      >
        {decisionError && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={decisionError} />}
        <Form
          name="decision"
          form={decisionForm}
          layout="vertical"
          preserve={false}
          onFinish={({ comment }) => decision && transition.mutate({ action: decision, comment: comment?.trim() })}
        >
          <Form.Item
            name="comment"
            label={
              decision && DECISION[decision].needsComment
                ? 'Comentário (obrigatório, mínimo 10 caracteres)'
                : 'Comentário (opcional)'
            }
            rules={
              decision && DECISION[decision].needsComment
                ? [
                    { required: true, whitespace: true, message: 'Informe o motivo' },
                    { min: 10, message: 'Mínimo de 10 caracteres' },
                  ]
                : []
            }
          >
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              autoFocus
              placeholder={
                decision && DECISION[decision].needsComment
                  ? 'Ex.: reduzir a quantidade e detalhar a justificativa…'
                  : 'Ex.: de acordo com o planejado.'
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
