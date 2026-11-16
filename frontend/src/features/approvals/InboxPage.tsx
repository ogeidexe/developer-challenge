import { Button, Card, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../shared/api/client'
import type { InboxItemDto } from '../../shared/api/types'
import { CATEGORY_LABEL, PageHeader, fmtDateTime, moneyBRL, stepLabel } from '../../shared/ui'

const PAGE_SIZE = 10

export function InboxPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const page = Number(params.get('page') ?? 0)
  const { data, isFetching } = useQuery({
    queryKey: ['inbox', page],
    queryFn: () => api.inbox({ page, size: PAGE_SIZE, sort: 'submittedAt,asc' }),
    placeholderData: keepPreviousData,
  })

  const columns: ColumnsType<InboxItemDto> = [
    { title: 'Número', key: 'n', width: 130, render: (_, r) => <Typography.Text strong>{r.requestNumber}{r.currentVersion > 1 ? ` · v${r.currentVersion}` : ''}</Typography.Text> },
    { title: 'Título', dataIndex: 'title', ellipsis: true },
    { title: 'Categoria', key: 'cat', render: (_, r) => CATEGORY_LABEL[r.category] },
    { title: 'Etapa atual', key: 'step', render: (_, r) => <Tag color="geekblue" bordered={false}>{stepLabel(r.currentStep.level)}</Tag> },
    { title: 'Total', key: 'total', align: 'right', render: (_, r) => moneyBRL(r.total) },
    { title: 'Solicitante', key: 'owner', render: (_, r) => r.owner.name },
    { title: 'Centro', key: 'cc', render: (_, r) => r.costCenter.code },
    { title: 'Submetida em', key: 'sub', render: (_, r) => fmtDateTime(r.submittedAt) },
    { title: '', key: 'open', width: 90, render: (_, r) => <Button size="small" type="primary" onClick={() => navigate(`/requests/${r.id}`)}>Analisar</Button> },
  ]

  return (
    <>
      <PageHeader
        title="Caixa de aprovação"
        subtitle="Solicitações cuja etapa atual você pode aprovar agora — já aplicados centro de custo, nível e segregação de funções"
      />
      <Card>
        <Table<InboxItemDto>
          rowKey="id" loading={isFetching} dataSource={data?.data ?? []} columns={columns} scroll={{ x: 960 }}
          locale={{ emptyText: 'Nada aguardando a sua aprovação' }}
          rowClassName={() => 'clickable-row'}
          onRow={(r) => ({ onClick: () => navigate(`/requests/${r.id}`) })}
          pagination={{
            current: (data?.page ?? 0) + 1, pageSize: PAGE_SIZE, total: data?.totalElements ?? 0,
            showSizeChanger: false, showTotal: (t) => `${t} registros`,
            onChange: (p) => setParams(p > 1 ? { page: String(p - 1) } : {}, { replace: true }),
          }}
        />
      </Card>
    </>
  )
}
