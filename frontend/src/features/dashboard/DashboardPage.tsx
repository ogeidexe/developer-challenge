import { Alert, Card, Col, Progress, Row, Skeleton, Statistic, Table, Typography } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api/client'
import { useAuth } from '../../shared/auth/AuthContext'
import type { DashboardSummaryDto } from '../../shared/api/types'
import { PageHeader, STATUSES, STATUS_LABEL, moneyBRL } from '../../shared/ui'
import { byNumber, byText, distinctFilters } from '../../shared/tableSort'

type BudgetRow = DashboardSummaryDto['budgets'][number]

const usage = (b: BudgetRow) => {
  const amount = parseFloat(b.amount || '0')
  return amount > 0 ? Math.min(100, Math.round((parseFloat(b.consumed || '0') / amount) * 100)) : 0
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard })

  if (error) return <Alert type="error" message="Não foi possível carregar o dashboard." showIcon />

  // the API omits zero counts; show every status so the cards don't jump around
  const count = (s: string) => data?.totals.find((t) => t.status === s)?.count ?? 0
  const scope =
    user?.role === 'ADMIN'
      ? 'todas as solicitações'
      : user?.role === 'APROVADOR'
        ? 'solicitações do seu centro de custo'
        : 'suas solicitações'

  return (
    <>
      <PageHeader title={`Olá, ${user?.name}`} subtitle={`Totais por status — ${scope}`} />

      <Row gutter={[16, 16]}>
        {STATUSES.map((s) => (
          <Col key={s} xs={12} sm={8} lg={4}>
            <Card size="small">
              {isLoading ? (
                <Skeleton active paragraph={false} />
              ) : (
                <Statistic title={STATUS_LABEL[s]} value={count(s)} />
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title={`Orçamento do mês corrente${data?.budgets[0] ? ` (${data.budgets[0].month})` : ''}`}
        style={{ marginTop: 16 }}
        extra={
          data?.averageApprovalTimeDays != null && (
            <Typography.Text type="secondary">
              Tempo médio de aprovação (30 dias): <strong>{data.averageApprovalTimeDays} dias</strong>
            </Typography.Text>
          )
        }
      >
        <Table<BudgetRow>
          rowKey="costCenterId"
          loading={isLoading}
          dataSource={data?.budgets ?? []}
          pagination={false}
          locale={{ emptyText: 'Sem orçamentos no seu escopo' }}
          scroll={{ x: 640 }}
          columns={[
            {
              title: 'Centro de custo',
              sorter: byText((b) => b.code),
              filters: distinctFilters(data?.budgets, (b) => b.code),
              onFilter: (value, b) => b.code === value,
              render: (_, b) => (
                <>
                  <strong>{b.code}</strong> — {b.name}
                </>
              ),
            },
            {
              title: 'Orçado',
              align: 'right',
              sorter: byNumber((b) => b.amount),
              render: (_, b) => moneyBRL(b.amount),
            },
            {
              title: 'Consumido',
              align: 'right',
              sorter: byNumber((b) => b.consumed),
              render: (_, b) => moneyBRL(b.consumed),
            },
            {
              title: 'Disponível',
              align: 'right',
              sorter: byNumber((b) => b.available),
              render: (_, b) => <strong>{moneyBRL(b.available)}</strong>,
            },
            {
              title: 'Uso',
              sorter: (a, b) => usage(a) - usage(b),
              width: '28%',
              render: (_, b) => {
                const pct = usage(b)
                return <Progress percent={pct} size="small" status={pct >= 90 ? 'exception' : 'normal'} />
              },
            },
          ]}
        />
      </Card>
    </>
  )
}
