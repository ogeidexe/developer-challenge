import { Button, Card, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../shared/api/client'
import type { InboxItemDto } from '../../shared/api/types'
import { CATEGORY_LABEL, PageHeader, categoryOptions, fmtDateTime, moneyBRL, stepLabel } from '../../shared/ui'
import { byDate, byNumber, byText, distinctFilters } from '../../shared/tableSort'

const PAGE_SIZE = 10
// The inbox is small (what one person can approve now): load it whole (API max 100) so the antd sorters and
// filters below work on every row, and let the Table paginate locally.
const INBOX_MAX = 100

export function InboxPage() {
  const navigate = useNavigate()
  const { data, isFetching } = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api.inbox({ page: 0, size: INBOX_MAX }),
  })
  const rows = data?.data ?? []

  const columns: ColumnsType<InboxItemDto> = [
    {
      title: 'Número',
      key: 'n',
      width: 130,
      render: (_, r) => (
        <Typography.Text strong>
          {r.requestNumber}
          {r.currentVersion > 1 ? ` · v${r.currentVersion}` : ''}
        </Typography.Text>
      ),
    },
    { title: 'Título', dataIndex: 'title', ellipsis: true, sorter: byText((r) => r.title) },
    {
      title: 'Categoria',
      key: 'cat',
      render: (_, r) => CATEGORY_LABEL[r.category],
      sorter: byText((r) => CATEGORY_LABEL[r.category]),
      filters: categoryOptions.map((o) => ({ text: o.label, value: o.value })),
      onFilter: (value, r) => r.category === value,
    },
    {
      title: 'Etapa atual',
      key: 'step',
      sorter: byText((r) => r.currentStep.level),
      filters: distinctFilters(
        rows,
        (r) => r.currentStep.level,
        (l) => stepLabel(l as never),
      ),
      onFilter: (value, r) => r.currentStep.level === value,
      render: (_, r) => (
        <Tag color="geekblue" bordered={false}>
          {stepLabel(r.currentStep.level)}
        </Tag>
      ),
    },
    {
      title: 'Total',
      key: 'total',
      align: 'right',
      render: (_, r) => moneyBRL(r.total),
      sorter: byNumber((r) => r.total),
    },
    { title: 'Solicitante', key: 'owner', render: (_, r) => r.owner.name, sorter: byText((r) => r.owner.name) },
    {
      title: 'Centro',
      key: 'cc',
      render: (_, r) => r.costCenter.code,
      sorter: byText((r) => r.costCenter.code),
      filters: distinctFilters(rows, (r) => r.costCenter.code),
      onFilter: (value, r) => r.costCenter.code === value,
    },
    {
      title: 'Submetida em',
      key: 'sub',
      render: (_, r) => fmtDateTime(r.submittedAt),
      sorter: byDate((r) => r.submittedAt),
      defaultSortOrder: 'ascend',
    },
    {
      title: '',
      key: 'open',
      width: 90,
      render: (_, r) => (
        <Button size="small" type="primary" onClick={() => navigate(`/requests/${r.id}`)}>
          Analisar
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Caixa de aprovação"
        subtitle="Solicitações cuja etapa atual você pode aprovar agora — já aplicados centro de custo, nível e segregação de funções"
      />
      <Card>
        <Table<InboxItemDto>
          rowKey="id"
          loading={isFetching}
          dataSource={rows}
          columns={columns}
          scroll={{ x: 960 }}
          locale={{ emptyText: 'Nada aguardando a sua aprovação' }}
          rowClassName={() => 'clickable-row'}
          onRow={(r) => ({ onClick: () => navigate(`/requests/${r.id}`) })}
          pagination={{
            pageSize: PAGE_SIZE,
            showSizeChanger: false,
            hideOnSinglePage: true,
            showTotal: (t) => `${t} registros`,
          }}
        />
      </Card>
    </>
  )
}
