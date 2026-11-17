import { Button, Card, DatePicker, Flex, Input, InputNumber, Space, Table, Typography } from 'antd'
import type { ColumnsType, TableProps } from 'antd/es/table'
import type { FilterDropdownProps } from 'antd/es/table/interface'
import { CalendarOutlined, DollarOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { api, type ListRequestsQuery } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthContext'
import type { Category, RequestStatus, RequestSummaryDto } from '../../shared/api/types'
import {
  CATEGORY_LABEL,
  PageHeader,
  StatusTag,
  categoryOptions,
  fmtDateTime,
  moneyBRL,
  statusOptions,
} from '../../shared/ui'
import { useState } from 'react'

const PAGE_SIZE = 10
const SORTABLE = new Set(['createdAt', 'title', 'total', 'status', 'submittedAt'])
const DEFAULT_SORT = 'createdAt,desc'

/** All list state lives in the URL (README §2.7: shareable link). */
function useListParams() {
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k) || undefined
  /** Applies several keys in ONE navigation — calling setParams twice in a row loses the first update. */
  const update = (patch: Record<string, string | undefined>, keepPage = false) =>
    // functional form: always applied to the latest URL, so two updates in the same tick never undo each other
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!keepPage) next.delete('page')
        return next
      },
      { replace: true },
    )
  return { get, update }
}

/** antd filter dropdown: free-text search in the title (server-side `q`). */
function TitleFilter({
  value,
  onApply,
  close,
}: { value?: string; onApply: (v?: string) => void } & Pick<FilterDropdownProps, 'close'>) {
  const [text, setText] = useState(value ?? '')
  const apply = (v?: string) => {
    onApply(v?.trim() || undefined)
    close()
  }
  return (
    <div style={{ padding: 8, width: 240 }} onKeyDown={(e) => e.stopPropagation()}>
      <Input.Search
        autoFocus
        allowClear
        placeholder="Buscar no título"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onSearch={apply}
        enterButton
      />
    </div>
  )
}

/** antd filter dropdown: total between min and max (server-side `minAmount` / `maxAmount`). */
function AmountFilter({
  min,
  max,
  onApply,
  close,
}: { min?: string; max?: string; onApply: (min?: string, max?: string) => void } & Pick<FilterDropdownProps, 'close'>) {
  const [from, setFrom] = useState<string | null>(min ?? null)
  const [to, setTo] = useState<string | null>(max ?? null)
  const invalid = from !== null && to !== null && Number(from) > Number(to)
  return (
    <div style={{ padding: 8, width: 240 }} onKeyDown={(e) => e.stopPropagation()}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <InputNumber<string>
          stringMode
          min="0"
          precision={2}
          decimalSeparator=","
          placeholder="Valor mín. (R$)"
          style={{ width: '100%' }}
          value={from}
          onChange={setFrom}
        />
        <InputNumber<string>
          stringMode
          min="0"
          precision={2}
          decimalSeparator=","
          placeholder="Valor máx. (R$)"
          style={{ width: '100%' }}
          value={to}
          onChange={setTo}
          status={invalid ? 'error' : undefined}
        />
        {invalid && <Typography.Text type="danger">O mínimo não pode passar do máximo</Typography.Text>}
        <Flex justify="space-between">
          <Button
            size="small"
            onClick={() => {
              setFrom(null)
              setTo(null)
              onApply(undefined, undefined)
              close()
            }}
          >
            Limpar
          </Button>
          <Button
            size="small"
            type="primary"
            disabled={invalid}
            onClick={() => {
              onApply(from ?? undefined, to ?? undefined)
              close()
            }}
          >
            Filtrar
          </Button>
        </Flex>
      </Space>
    </div>
  )
}

/** antd filter dropdown: creation date range (server-side `createdFrom` / `createdTo`). */
function CreatedFilter({
  from,
  to,
  onApply,
  close,
}: { from?: string; to?: string; onApply: (from?: string, to?: string) => void } & Pick<FilterDropdownProps, 'close'>) {
  return (
    <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
      <DatePicker.RangePicker
        placeholder={['Criada de', 'Criada até']}
        format="DD/MM/YYYY"
        value={from && to ? [dayjs(from), dayjs(to)] : null}
        onChange={(range) => {
          onApply(range?.[0]?.format('YYYY-MM-DD'), range?.[1]?.format('YYYY-MM-DD'))
          close()
        }}
      />
    </div>
  )
}

export function RequestListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { get, update } = useListParams()

  const sort = get('sort') ?? DEFAULT_SORT
  const [sortField, sortDir] = sort.split(',')
  const query: ListRequestsQuery = {
    page: Number(get('page') ?? 0),
    size: PAGE_SIZE,
    sort,
    status: get('status') as RequestStatus | undefined,
    category: get('category') as Category | undefined,
    costCenterId: get('costCenterId'),
    q: get('q'),
    createdFrom: get('createdFrom'),
    createdTo: get('createdTo'),
    minAmount: get('minAmount'),
    maxAmount: get('maxAmount'),
  }

  const { data, isFetching } = useQuery({
    queryKey: ['requests', query],
    queryFn: () => api.listRequests(query),
    placeholderData: keepPreviousData,
  })
  const { data: centers } = useQuery({ queryKey: ['centers'], queryFn: api.listCostCenters })

  const sortOrder = (field: string) => (sortField === field ? (sortDir === 'asc' ? 'ascend' : 'descend') : null)

  const selected = (key: string) => (get(key) ? get(key)!.split(',') : null)

  const columns: ColumnsType<RequestSummaryDto> = [
    {
      title: 'Número',
      key: 'number',
      width: 130,
      render: (_, r) => (
        <Typography.Text strong>
          {r.requestNumber}
          {r.currentVersion > 1 ? ` · v${r.currentVersion}` : ''}
        </Typography.Text>
      ),
    },
    {
      title: 'Título',
      dataIndex: 'title',
      key: 'title',
      sorter: true,
      sortOrder: sortOrder('title'),
      ellipsis: true,
      filteredValue: get('q') ? [get('q')!] : null,
      filterIcon: (active) => <SearchOutlined style={{ color: active ? '#0b5cad' : undefined }} />,
      filterDropdown: ({ close }) => (
        <TitleFilter key={get('q') ?? ''} value={get('q')} close={close} onApply={(q) => update({ q })} />
      ),
    },
    {
      title: 'Categoria',
      key: 'category',
      render: (_, r) => CATEGORY_LABEL[r.category],
      filters: categoryOptions.map((o) => ({ text: o.label, value: o.value })),
      filterMultiple: false,
      filteredValue: selected('category'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      sorter: true,
      sortOrder: sortOrder('status'),
      render: (_, r) => <StatusTag status={r.status} />,
      filters: statusOptions.map((o) => ({ text: o.label, value: o.value })),
      filterMultiple: false,
      filteredValue: selected('status'),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      sorter: true,
      sortOrder: sortOrder('total'),
      render: (v: string) => moneyBRL(v),
      filteredValue: get('minAmount') || get('maxAmount') ? ['range'] : null,
      filterIcon: (active) => <DollarOutlined style={{ color: active ? '#0b5cad' : undefined }} />,
      filterDropdown: ({ close }) => (
        <AmountFilter
          key={`${get('minAmount') ?? ''}-${get('maxAmount') ?? ''}`}
          min={get('minAmount')}
          max={get('maxAmount')}
          close={close}
          onApply={(minAmount, maxAmount) => update({ minAmount, maxAmount })}
        />
      ),
    },
    {
      title: 'Centro',
      key: 'cc',
      render: (_, r) => r.costCenter.code,
      filters: (centers ?? []).map((c) => ({ text: c.code, value: c.id })),
      filteredValue: selected('costCenterId'),
    },
    {
      title: 'Solicitante',
      key: 'owner',
      render: (_, r) => `${r.owner.name}${r.owner.id === user?.id ? ' (você)' : ''}`,
    },
    {
      title: 'Criada em',
      dataIndex: 'createdAt',
      key: 'createdAt',
      sorter: true,
      sortOrder: sortOrder('createdAt'),
      render: (v: string) => fmtDateTime(v),
      filteredValue: get('createdFrom') || get('createdTo') ? ['range'] : null,
      filterIcon: (active) => <CalendarOutlined style={{ color: active ? '#0b5cad' : undefined }} />,
      filterDropdown: ({ close }) => (
        <CreatedFilter
          from={get('createdFrom')}
          to={get('createdTo')}
          close={close}
          onApply={(createdFrom, createdTo) => update({ createdFrom, createdTo })}
        />
      ),
    },
  ]

  const onTableChange: TableProps<RequestSummaryDto>['onChange'] = (pagination, filters, sorter, extra) => {
    if (extra.action === 'filter') {
      // antd column filters (status, category, cost center) → URL; the dropdown filters update the URL themselves
      const one = (key: string) => (filters[key]?.length ? String(filters[key]![0]) : undefined)
      update({
        status: one('status'),
        category: one('category'),
        costCenterId: filters.cc?.length ? filters.cc.map(String).join(',') : undefined,
      })
      return
    }
    if (extra.action === 'paginate') {
      update({ page: String((pagination.current ?? 1) - 1) }, true)
      return
    }
    if (extra.action === 'sort') {
      const s = Array.isArray(sorter) ? sorter[0] : sorter
      const field = String(s?.field ?? '')
      // third click clears the sort → back to the default
      update({
        sort: s?.order && SORTABLE.has(field) ? `${field},${s.order === 'ascend' ? 'asc' : 'desc'}` : undefined,
      })
    }
  }

  const hasFilters = [
    'status',
    'category',
    'costCenterId',
    'q',
    'createdFrom',
    'createdTo',
    'minAmount',
    'maxAmount',
  ].some((k) => get(k))

  return (
    <>
      <PageHeader
        title="Solicitações"
        subtitle="Paginação, ordenação e filtros no servidor — refletidos na URL"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/requests/new')}>
            Nova solicitação
          </Button>
        }
      />

      <Card>
        <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">
            Filtre e ordene pelos cabeçalhos das colunas (ícones de filtro e setas).
          </Typography.Text>
          {hasFilters && (
            <Button
              type="link"
              onClick={() =>
                update({
                  status: undefined,
                  category: undefined,
                  costCenterId: undefined,
                  q: undefined,
                  createdFrom: undefined,
                  createdTo: undefined,
                  minAmount: undefined,
                  maxAmount: undefined,
                })
              }
            >
              Limpar filtros
            </Button>
          )}
        </Flex>

        <Table<RequestSummaryDto>
          rowKey="id"
          loading={isFetching}
          dataSource={data?.data ?? []}
          columns={columns}
          scroll={{ x: 960 }}
          locale={{
            emptyText: hasFilters ? 'Nenhuma solicitação encontrada com esses filtros' : 'Nenhuma solicitação ainda',
          }}
          rowClassName={() => 'clickable-row'}
          onRow={(r) => ({ onClick: () => navigate(`/requests/${r.id}`) })}
          onChange={onTableChange}
          pagination={{
            current: (data?.page ?? 0) + 1,
            pageSize: PAGE_SIZE,
            total: data?.totalElements ?? 0,
            showSizeChanger: false,
            showTotal: (t) => `${t} registros`,
          }}
        />
      </Card>
    </>
  )
}
