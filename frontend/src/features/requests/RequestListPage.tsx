import { Button, Card, DatePicker, Flex, Input, InputNumber, Select, Table, Typography } from 'antd'
import type { ColumnsType, TableProps } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, type ListRequestsQuery } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthContext'
import type { Category, RequestStatus, RequestSummaryDto } from '../../shared/api/types'
import {
  CATEGORY_LABEL, PageHeader, StatusTag, categoryOptions, fmtDateTime, moneyBRL, statusOptions,
} from '../../shared/ui'

const PAGE_SIZE = 10
const SORTABLE = new Set(['createdAt', 'title', 'total', 'status', 'submittedAt'])
const DEFAULT_SORT = 'createdAt,desc'

/** All list state lives in the URL (README §2.7: shareable link). */
function useListParams() {
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) || undefined
  /** Applies several keys in ONE navigation — calling setParams twice in a row loses the first update. */
  const update = (patch: Record<string, string | undefined>, keepPage = false) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!keepPage) next.delete('page')
    setParams(next, { replace: true })
  }
  return { get, update }
}

export function RequestListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { get, update } = useListParams()

  const sort = get('sort') ?? DEFAULT_SORT
  const [sortField, sortDir] = sort.split(',')
  const query: ListRequestsQuery = {
    page: Number(get('page') ?? 0), size: PAGE_SIZE, sort,
    status: get('status') as RequestStatus | undefined,
    category: get('category') as Category | undefined,
    costCenterId: get('costCenterId'), q: get('q'),
    createdFrom: get('createdFrom'), createdTo: get('createdTo'),
    minAmount: get('minAmount'), maxAmount: get('maxAmount'),
  }

  const { data, isFetching } = useQuery({
    queryKey: ['requests', query],
    queryFn: () => api.listRequests(query),
    placeholderData: keepPreviousData,
  })
  const { data: centers } = useQuery({ queryKey: ['centers'], queryFn: api.listCostCenters })

  const sortOrder = (field: string) => (sortField === field ? (sortDir === 'asc' ? 'ascend' : 'descend') : null)

  const columns: ColumnsType<RequestSummaryDto> = [
    {
      title: 'Número', key: 'number', width: 130,
      render: (_, r) => <Typography.Text strong>{r.requestNumber}{r.currentVersion > 1 ? ` · v${r.currentVersion}` : ''}</Typography.Text>,
    },
    { title: 'Título', dataIndex: 'title', key: 'title', sorter: true, sortOrder: sortOrder('title'), ellipsis: true },
    { title: 'Categoria', key: 'category', render: (_, r) => CATEGORY_LABEL[r.category] },
    { title: 'Status', dataIndex: 'status', key: 'status', sorter: true, sortOrder: sortOrder('status'), render: (_, r) => <StatusTag status={r.status} /> },
    { title: 'Total', dataIndex: 'total', key: 'total', align: 'right', sorter: true, sortOrder: sortOrder('total'), render: (v: string) => moneyBRL(v) },
    { title: 'Centro', key: 'cc', render: (_, r) => r.costCenter.code },
    { title: 'Solicitante', key: 'owner', render: (_, r) => `${r.owner.name}${r.owner.id === user?.id ? ' (você)' : ''}` },
    { title: 'Criada em', dataIndex: 'createdAt', key: 'createdAt', sorter: true, sortOrder: sortOrder('createdAt'), render: (v: string) => fmtDateTime(v) },
  ]

  const onTableChange: TableProps<RequestSummaryDto>['onChange'] = (pagination, _filters, sorter, extra) => {
    if (extra.action === 'paginate') {
      update({ page: String((pagination.current ?? 1) - 1) }, true)
      return
    }
    if (extra.action === 'sort') {
      const s = Array.isArray(sorter) ? sorter[0] : sorter
      const field = String(s?.field ?? '')
      // third click clears the sort → back to the default
      update({ sort: s?.order && SORTABLE.has(field) ? `${field},${s.order === 'ascend' ? 'asc' : 'desc'}` : undefined })
    }
  }

  const hasFilters = ['status', 'category', 'costCenterId', 'q', 'createdFrom', 'createdTo', 'minAmount', 'maxAmount'].some((k) => get(k))

  return (
    <>
      <PageHeader
        title="Solicitações"
        subtitle="Paginação, ordenação e filtros no servidor — refletidos na URL"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/requests/new')}>Nova solicitação</Button>}
      />

      <Card>
        <Flex wrap gap={8} style={{ marginBottom: 16 }}>
          <Select allowClear placeholder="Status" style={{ width: 190 }} value={get('status')}
            onChange={(v?: string) => update({ status: v })} options={statusOptions} />
          <Select allowClear placeholder="Categoria" style={{ width: 160 }} value={get('category')}
            onChange={(v?: string) => update({ category: v })} options={categoryOptions} />
          <Select allowClear placeholder="Centro de custo" style={{ width: 170 }} value={get('costCenterId')}
            onChange={(v?: string) => update({ costCenterId: v })}
            options={(centers ?? []).map((c) => ({ value: c.id, label: c.code }))} />
          <Input.Search
            key={get('q') ?? ''} // re-mount when the URL changes (back/forward, "clear filters")
            allowClear placeholder="Buscar no título" style={{ width: 220 }} defaultValue={get('q')}
            onSearch={(v) => update({ q: v.trim() || undefined })}
          />
          <DatePicker.RangePicker
            placeholder={['Criada de', 'Criada até']} format="DD/MM/YYYY"
            value={get('createdFrom') && get('createdTo') ? [dayjs(get('createdFrom')), dayjs(get('createdTo'))] : null}
            onChange={(range) => update({
              createdFrom: range?.[0]?.format('YYYY-MM-DD'),
              createdTo: range?.[1]?.format('YYYY-MM-DD'),
            })}
          />
          <InputNumber<string>
            stringMode min="0" precision={2} decimalSeparator="," placeholder="Valor mín. (R$)" style={{ width: 150 }}
            value={get('minAmount') ?? null} onChange={(v) => update({ minAmount: v ?? undefined })}
          />
          <InputNumber<string>
            stringMode min="0" precision={2} decimalSeparator="," placeholder="Valor máx. (R$)" style={{ width: 150 }}
            value={get('maxAmount') ?? null} onChange={(v) => update({ maxAmount: v ?? undefined })}
          />
          {hasFilters && (
            <Button type="link" onClick={() => update({
              status: undefined, category: undefined, costCenterId: undefined, q: undefined,
              createdFrom: undefined, createdTo: undefined, minAmount: undefined, maxAmount: undefined,
            })}>Limpar filtros</Button>
          )}
        </Flex>

        <Table<RequestSummaryDto>
          rowKey="id"
          loading={isFetching}
          dataSource={data?.data ?? []}
          columns={columns}
          scroll={{ x: 960 }}
          locale={{ emptyText: hasFilters ? 'Nenhuma solicitação encontrada com esses filtros' : 'Nenhuma solicitação ainda' }}
          rowClassName={() => 'clickable-row'}
          onRow={(r) => ({ onClick: () => navigate(`/requests/${r.id}`) })}
          onChange={onTableChange}
          pagination={{
            current: (data?.page ?? 0) + 1, pageSize: PAGE_SIZE, total: data?.totalElements ?? 0,
            showSizeChanger: false, showTotal: (t) => `${t} registros`,
          }}
        />
      </Card>
    </>
  )
}
