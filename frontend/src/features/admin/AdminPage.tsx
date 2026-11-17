import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { api } from '../../shared/api/client'
import type { CostCenterDto, Role, UserDto } from '../../shared/api/types'
import { PageHeader, errText, moneyBRL, roleLabel, serverFieldErrors } from '../../shared/ui'
import { fullNameRules } from '../../shared/validation'

const ROLE_COLOR: Record<Role, string> = { ADMIN: 'volcano', APROVADOR: 'geekblue', SOLICITANTE: 'default' }

function useCenters() {
  const { data } = useQuery({ queryKey: ['centers'], queryFn: api.listCostCenters })
  const options = (data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))
  const code = (id: string | null) => (id ? ((data ?? []).find((c) => c.id === id)?.code ?? '?') : 'Global')
  return { centers: data ?? [], options, code }
}

// ---------------- Users ----------------
interface UserForm {
  email?: string
  password?: string
  name: string
  role: Role
  approverLevel?: string | null
  costCenterId?: string | null
  active?: boolean
}

function UsersTab() {
  const qc = useQueryClient()
  const { message } = App.useApp()
  const [form] = Form.useForm<UserForm>()
  const [editing, setEditing] = useState<UserDto | null | undefined>(undefined) // undefined = closed, null = new
  const { options, code } = useCenters()
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.listUsers({ size: 100 }) })
  const role = Form.useWatch('role', form)

  const save = useMutation({
    mutationFn: (v: UserForm) => {
      const body = {
        ...v,
        approverLevel: v.role === 'APROVADOR' ? v.approverLevel : null,
        costCenterId: v.costCenterId ?? null,
      }
      return editing
        ? api.updateUser(editing.id, { ...body, lockVersion: editing.lockVersion })
        : api.createUser(body as Required<UserForm>)
    },
    onSuccess: async () => {
      message.success(editing ? 'Usuário atualizado.' : 'Usuário criado.')
      setEditing(undefined)
      await qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => {
      const fields = serverFieldErrors(e)
      if (fields) form.setFields(fields as never)
      else message.error(errText(e))
    },
  })

  const open = (u: UserDto | null) => {
    form.resetFields()
    if (u)
      form.setFieldsValue({
        name: u.name,
        role: u.role,
        approverLevel: u.approverLevel,
        costCenterId: u.costCenterId,
        active: u.active,
      })
    setEditing(u)
  }

  return (
    <>
      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">Usuários de todos os papéis e níveis</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>
          Novo usuário
        </Button>
      </Flex>
      <Table<UserDto>
        rowKey="id"
        loading={isLoading}
        dataSource={data?.data ?? []}
        pagination={false}
        scroll={{ x: 720 }}
        columns={[
          { title: 'Nome', dataIndex: 'name' },
          { title: 'E-mail', dataIndex: 'email' },
          {
            title: 'Papel',
            render: (_, u) => (
              <Tag color={ROLE_COLOR[u.role]} bordered={false}>
                {roleLabel(u.role)}
              </Tag>
            ),
          },
          { title: 'Nível', render: (_, u) => u.approverLevel?.replace('NIVEL_', 'N') ?? '—' },
          { title: 'Centro de custo', render: (_, u) => code(u.costCenterId) },
          {
            title: 'Ativo',
            render: (_, u) => (
              <Tag color={u.active ? 'success' : 'default'} bordered={false}>
                {u.active ? 'Sim' : 'Não'}
              </Tag>
            ),
          },
          {
            title: '',
            width: 90,
            render: (_, u) => (
              <Button size="small" onClick={() => open(u)}>
                Editar
              </Button>
            ),
          },
        ]}
      />
      <Modal
        open={editing !== undefined}
        title={editing ? `Editar ${editing.name}` : 'Novo usuário'}
        forceRender
        okText="Salvar"
        cancelText="Cancelar"
        confirmLoading={save.isPending}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
      >
        <Form<UserForm> name="user" form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          {!editing && (
            <>
              <Form.Item name="email" label="E-mail" rules={[{ required: true, type: 'email' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="Senha" rules={[{ required: true, min: 8 }]}>
                <Input.Password />
              </Form.Item>
            </>
          )}
          <Form.Item name="name" label="Nome completo" rules={fullNameRules}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="role" label="Papel" rules={[{ required: true }]}>
                <Select
                  options={(['SOLICITANTE', 'APROVADOR', 'ADMIN'] as Role[]).map((r) => ({
                    value: r,
                    label: roleLabel(r),
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              {role === 'APROVADOR' && (
                <Form.Item
                  name="approverLevel"
                  label="Nível"
                  rules={[{ required: true, message: 'Obrigatório para Aprovador' }]}
                >
                  <Select
                    options={[
                      { value: 'NIVEL_1', label: 'Nível 1' },
                      { value: 'NIVEL_2', label: 'Nível 2' },
                    ]}
                  />
                </Form.Item>
              )}
            </Col>
          </Row>
          <Form.Item name="costCenterId" label="Centro de custo" tooltip="Vazio = admin global (apenas ADMIN)">
            <Select allowClear options={options} />
          </Form.Item>
          {editing && (
            <Form.Item name="active" label="Ativo" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  )
}

// ---------------- Cost centers ----------------
function CentersTab() {
  const qc = useQueryClient()
  const { message } = App.useApp()
  const [form] = Form.useForm<{ code: string; name: string }>()
  const [open, setOpen] = useState(false)
  const { centers } = useCenters()
  const create = useMutation({
    mutationFn: (v: { code: string; name: string }) => api.createCostCenter(v.code, v.name),
    onSuccess: async () => {
      message.success('Centro de custo criado.')
      setOpen(false)
      form.resetFields()
      await qc.invalidateQueries({ queryKey: ['centers'] })
    },
    onError: (e) => {
      const fields = serverFieldErrors(e)
      if (fields) form.setFields(fields as never)
      else message.error(errText(e))
    },
  })
  return (
    <>
      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">Centros de custo do sistema</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Novo centro
        </Button>
      </Flex>
      <Table<CostCenterDto>
        rowKey="id"
        dataSource={centers}
        pagination={false}
        columns={[
          { title: 'Código', dataIndex: 'code' },
          { title: 'Nome', dataIndex: 'name' },
          {
            title: 'Ativo',
            render: (_, c) => (
              <Tag color={c.active ? 'success' : 'default'} bordered={false}>
                {c.active ? 'Sim' : 'Não'}
              </Tag>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        title="Novo centro de custo"
        forceRender
        okText="Criar"
        cancelText="Cancelar"
        confirmLoading={create.isPending}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
      >
        <Form name="costCenter" form={form} layout="vertical" onFinish={(v) => create.mutate(v)}>
          <Form.Item name="code" label="Código" rules={[{ required: true, min: 2, max: 30 }]}>
            <Input placeholder="CC-MKT-03" />
          </Form.Item>
          <Form.Item name="name" label="Nome" rules={[{ required: true, min: 2, max: 120 }]}>
            <Input placeholder="Marketing" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ---------------- Budgets ----------------
function BudgetsTab() {
  const qc = useQueryClient()
  const { message } = App.useApp()
  const { options } = useCenters()
  const [ccId, setCcId] = useState<string>()
  const [month, setMonth] = useState<Dayjs>(dayjs())
  const [form] = Form.useForm<{ amount: string }>()
  const ym = month.format('YYYY-MM')

  const {
    data: budget,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['budget', ccId, ym],
    queryFn: () => api.getBudget(ccId!, ym),
    enabled: Boolean(ccId),
    retry: false,
  })
  const set = useMutation({
    mutationFn: ({ amount }: { amount: string }) => api.setBudget(ccId!, ym, amount),
    onSuccess: async () => {
      message.success('Orçamento definido.')
      form.resetFields()
      await qc.invalidateQueries({ queryKey: ['budget', ccId, ym] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    // 422 BUDGET_BELOW_CONSUMED is a backend rule — show its explanation inline on the field
    onError: (e) => form.setFields([{ name: 'amount', errors: [errText(e)] }]),
  })

  return (
    <>
      <Flex wrap gap={8} style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 280 }}
          placeholder="Centro de custo"
          value={ccId}
          onChange={setCcId}
          options={options}
        />
        <DatePicker
          picker="month"
          value={month}
          onChange={(d) => setMonth(d ?? dayjs())}
          format="MM/YYYY"
          allowClear={false}
        />
      </Flex>
      {!ccId && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Selecione um centro de custo" />}
      {error && <Alert type="error" showIcon message={errText(error)} />}
      {ccId && budget && (
        <Card size="small" loading={isFetching} style={{ maxWidth: 620 }}>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Statistic title="Orçado" value={moneyBRL(budget.amount)} />
            </Col>
            <Col span={8}>
              <Statistic title="Consumido" value={moneyBRL(budget.consumed)} />
            </Col>
            <Col span={8}>
              <Statistic title="Disponível" value={moneyBRL(budget.available)} valueStyle={{ fontWeight: 700 }} />
            </Col>
          </Row>
          <Form name="budget" form={form} layout="inline" onFinish={(v) => set.mutate(v)} style={{ rowGap: 8 }}>
            <Form.Item name="amount" rules={[{ required: true, message: 'Informe o valor' }]} style={{ flex: 1 }}>
              <InputNumber<string>
                stringMode
                min="0"
                precision={2}
                decimalSeparator=","
                style={{ width: '100%' }}
                placeholder="Novo orçamento (R$)"
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={set.isPending}>
                Definir
              </Button>
            </Form.Item>
          </Form>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            Um valor abaixo do já consumido é recusado pelo back-end (422 BUDGET_BELOW_CONSUMED).
          </Typography.Paragraph>
        </Card>
      )}
    </>
  )
}

export function AdminPage() {
  return (
    <>
      <PageHeader
        title="Administração"
        subtitle="Opcional pelo enunciado (README §2.7) — os mesmos recursos estão na API"
      />
      <Card>
        <Tabs
          items={[
            { key: 'users', label: 'Usuários', children: <UsersTab /> },
            { key: 'centers', label: 'Centros de custo', children: <CentersTab /> },
            { key: 'budgets', label: 'Orçamentos', children: <BudgetsTab /> },
          ]}
        />
      </Card>
    </>
  )
}
