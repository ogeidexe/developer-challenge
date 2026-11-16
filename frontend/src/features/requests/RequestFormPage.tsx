import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, App, Button, Card, Col, DatePicker, Flex, Form, Input, InputNumber, Result, Row, Select, Statistic, Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { useAuth } from '../../shared/auth/AuthContext'
import type { Category } from '../../shared/api/types'
import { PageHeader, categoryOptions, errText, moneyBRL, serverFieldErrors } from '../../shared/ui'

interface ItemValue { description?: string; quantity?: number | null; unitPrice?: string | null }
interface FormValues {
  title: string; description?: string; category: Category; costCenterId: string
  neededBy?: Dayjs | null; items: ItemValue[]
}

/** Display-only line total in cents (the backend is the source of truth — README §2.2). */
function lineCents(it?: ItemValue): number {
  const qty = Number(it?.quantity) || 0
  const price = parseFloat(it?.unitPrice ?? '') || 0
  return Math.round(qty * price * 100)
}
const centsToDecimal = (c: number) => (c / 100).toFixed(2)

export function RequestFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { message } = App.useApp()
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()
  const idemKey = useRef(crypto.randomUUID()) // one key per form session; retries reuse it (README §3.2)
  const [banner, setBanner] = useState<string | null>(null)

  const { data: centers } = useQuery({ queryKey: ['centers'], queryFn: api.listCostCenters })
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['request', id], queryFn: () => api.getRequest(id!), enabled: isEdit, retry: false,
  })

  useEffect(() => {
    if (!detail) return
    form.setFieldsValue({
      title: detail.title, description: detail.description ?? undefined, category: detail.category,
      costCenterId: detail.costCenter.id, neededBy: detail.neededBy ? dayjs(detail.neededBy) : null,
      items: detail.items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
    })
  }, [detail, form])

  const items = Form.useWatch('items', form) ?? []
  const totalCents = items.reduce((sum, it) => sum + lineCents(it), 0)

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        title: values.title.trim(), description: values.description?.trim() || null, category: values.category,
        costCenterId: values.costCenterId, neededBy: values.neededBy ? values.neededBy.format('YYYY-MM-DD') : null,
        items: values.items.map((it) => ({ description: it.description!.trim(), quantity: Number(it.quantity), unitPrice: String(it.unitPrice) })),
      }
      return isEdit
        ? api.updateRequest(id!, { ...payload, lockVersion: detail!.lockVersion })
        : api.createRequest(payload, idemKey.current)
    },
    onSuccess: (saved) => {
      message.success(isEdit ? 'Solicitação atualizada.' : 'Rascunho criado.')
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['request', saved.id] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      navigate(`/requests/${saved.id}`, { replace: true })
    },
    onError: (e) => {
      const fields = serverFieldErrors(e)
      if (fields) { form.setFields(fields as never); setBanner(null); return }
      if (e instanceof ApiError && e.status === 409) {
        setBanner(`${e.detail} Recarregamos os dados atuais — revise e salve novamente.`)
        qc.invalidateQueries({ queryKey: ['request', id] })
        return
      }
      setBanner(errText(e))
    },
  })

  if (isEdit && isLoading) return <Card loading style={{ minHeight: 320 }} />
  if (isEdit && error) {
    return <Result status="404" title="Solicitação não encontrada" subTitle={errText(error)}
      extra={<Button onClick={() => navigate('/requests')}>Voltar à lista</Button>} />
  }

  return (
    <>
      <PageHeader
        title={isEdit ? `Editar ${detail?.requestNumber ?? ''}` : 'Nova solicitação de compra'}
        subtitle={isEdit ? 'Edição permitida apenas em Rascunho ou Devolvida p/ ajuste' : 'A solicitação nasce como Rascunho'}
        extra={<Button onClick={() => navigate(-1)}>Voltar</Button>}
      />
      {banner && <Alert type="warning" showIcon closable style={{ marginBottom: 16 }} message={banner} onClose={() => setBanner(null)} />}

      <Form<FormValues>
        name="request"
        form={form} layout="vertical" scrollToFirstError
        onFinish={(values) => save.mutate(values)}
        initialValues={{ costCenterId: user?.costCenterId ?? undefined, items: [{ quantity: 1 }] }}
      >
        <Row gutter={16}>
          <Col xs={24} lg={16}>
            <Card title="Dados da solicitação" style={{ marginBottom: 16 }}>
              <Form.Item name="title" label="Título" rules={[{ required: true, message: 'Informe o título' }, { min: 3, max: 120, message: 'Entre 3 e 120 caracteres' }]}>
                <Input placeholder="Ex.: Notebooks para o time de TI" />
              </Form.Item>
              <Form.Item name="description" label="Descrição" rules={[{ max: 2000 }]}>
                <Input.TextArea rows={3} showCount maxLength={2000} placeholder="Justificativa, contexto…" />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="category" label="Categoria" rules={[{ required: true, message: 'Selecione a categoria' }]}
                    tooltip="Software sempre termina com uma etapa ADMIN">
                    <Select options={categoryOptions} placeholder="Selecione…" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={9}>
                  <Form.Item name="costCenterId" label="Centro de custo" rules={[{ required: true, message: 'Selecione o centro de custo' }]}>
                    <Select placeholder="Padrão: o seu" options={(centers ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={7}>
                  <Form.Item name="neededBy" label="Necessário até" tooltip="Opcional; precisa ser uma data futura">
                    <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabledDate={(d) => d.isBefore(dayjs().endOf('day'))} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card title="Itens">
              <Form.List
                name="items"
                rules={[{ validator: (_, v?: ItemValue[]) => (v?.length ? Promise.resolve() : Promise.reject(new Error('Informe ao menos um item'))) }]}
              >
                {(fields, { add, remove }, { errors }) => (
                  <>
                    {fields.map((field, index) => (
                      <Row key={field.key} gutter={8} align="top" wrap>
                        <Col xs={24} md={11}>
                          <Form.Item name={[field.name, 'description']} label={index === 0 ? 'Descrição' : undefined}
                            rules={[{ required: true, whitespace: true, message: 'Descrição obrigatória' }, { max: 255 }]}>
                            <Input placeholder="Descrição do item" />
                          </Form.Item>
                        </Col>
                        <Col xs={8} md={3}>
                          <Form.Item name={[field.name, 'quantity']} label={index === 0 ? 'Qtd.' : undefined}
                            rules={[{ required: true, message: 'Qtd.' }, { type: 'integer', min: 1, max: 1_000_000, message: 'Inteiro ≥ 1' }]}>
                            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={10} md={5}>
                          <Form.Item name={[field.name, 'unitPrice']} label={index === 0 ? 'Preço unit. (R$)' : undefined}
                            rules={[{ required: true, message: 'Preço' }]}>
                            <InputNumber<string> stringMode min="0.01" precision={2} decimalSeparator="," style={{ width: '100%' }} placeholder="0,00" />
                          </Form.Item>
                        </Col>
                        <Col xs={4} md={4}>
                          <Form.Item label={index === 0 ? 'Subtotal' : undefined}>
                            <Typography.Text>{moneyBRL(centsToDecimal(lineCents(items[field.name])))}</Typography.Text>
                          </Form.Item>
                        </Col>
                        <Col xs={2} md={1}>
                          <Form.Item label={index === 0 ? ' ' : undefined}>
                            <Button type="text" danger icon={<DeleteOutlined />} disabled={fields.length === 1}
                              aria-label="Remover item" onClick={() => remove(field.name)} />
                          </Form.Item>
                        </Col>
                      </Row>
                    ))}
                    <Form.ErrorList errors={errors} />
                    <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>Adicionar item</Button>
                  </>
                )}
              </Form.List>
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <Card style={{ position: 'sticky', top: 24 }}>
              <Statistic title="Total (prévia)" value={moneyBRL(centsToDecimal(totalCents))} />
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                Apenas exibição: o back-end recalcula cada item (quantidade × preço unitário) e ignora qualquer total enviado.
              </Typography.Paragraph>
              <Flex vertical gap={8}>
                <Button type="primary" htmlType="submit" block loading={save.isPending}>
                  {isEdit ? 'Salvar alterações' : 'Criar rascunho'}
                </Button>
                <Button block onClick={() => navigate(-1)}>Cancelar</Button>
              </Flex>
            </Card>
          </Col>
        </Row>
      </Form>
    </>
  )
}
