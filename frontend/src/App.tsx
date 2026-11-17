import { useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Button, Dropdown, Flex, Layout, Menu, Result, Tag, Typography, theme, type MenuProps } from 'antd'
import {
  AuditOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  ReloadOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useAuth } from './shared/auth/AuthContext'
import { Logo } from './shared/Logo'
import { roleLabel } from './shared/ui'
import { LoginPage } from './features/auth/LoginPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { RequestListPage } from './features/requests/RequestListPage'
import { RequestFormPage } from './features/requests/RequestFormPage'
import { RequestDetailPage } from './features/requests/RequestDetailPage'
import { InboxPage } from './features/approvals/InboxPage'
import { AdminPage } from './features/admin/AdminPage'
import { USE_MOCK_BACKEND } from './shared/config'
import type { Role } from './shared/api/types'

const { Header, Sider, Content } = Layout

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user)
    return <Navigate to={`/login?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

/** UX-only route guard; the API still enforces every rule (403/404). */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (user && !roles.includes(user.role)) {
    return (
      <Result
        status="403"
        title="Acesso negado"
        subTitle="Seu papel não permite acessar esta página."
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            Ir para o dashboard
          </Button>
        }
      />
    )
  }
  return <>{children}</>
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <Result
      status="404"
      title="Página não encontrada"
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          Voltar ao início
        </Button>
      }
    />
  )
}

function Shell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const [collapsed, setCollapsed] = useState(false)
  if (!user) return null

  const section = '/' + (location.pathname.split('/')[1] ?? '')
  const menuItems: MenuProps['items'] = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/requests', icon: <FileTextOutlined />, label: 'Solicitações' },
    ...(user.role !== 'SOLICITANTE'
      ? [{ key: '/approvals', icon: <AuditOutlined />, label: 'Caixa de aprovação' }]
      : []),
    ...(user.role === 'ADMIN' ? [{ key: '/admin', icon: <SettingOutlined />, label: 'Administração' }] : []),
  ]
  const userMenu: MenuProps['items'] = [
    { key: 'who', disabled: true, label: <Typography.Text type="secondary">{user.email}</Typography.Text> },
    { type: 'divider' },
    ...(USE_MOCK_BACKEND ? [{ key: 'reset', icon: <ReloadOutlined />, label: 'Reiniciar dados de demonstração' }] : []),
    { key: 'logout', icon: <LogoutOutlined />, label: 'Sair', danger: true },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} breakpoint="lg" width={232}>
        <Flex
          align="center"
          justify="center"
          style={{ height: 64, color: '#fff', fontWeight: 700, letterSpacing: 0.3 }}
        >
          {collapsed ? 'KS' : 'Kingspan · Compras'}
        </Flex>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[section]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Flex justify="space-between" align="center" style={{ height: '100%' }}>
            <Flex align="center" gap={12}>
              <Logo height={32} />
              <Typography.Text type="secondary">
                Solicitações de compra{USE_MOCK_BACKEND ? ' · backend simulado em memória' : ''}
              </Typography.Text>
            </Flex>
            <Dropdown
              trigger={['click']}
              menu={{
                items: userMenu,
                onClick: ({ key }) => {
                  if (key === 'logout') logout()
                  if (key === 'reset' && USE_MOCK_BACKEND) {
                    // seed ids change on reset → sign in again
                    void import('./shared/api/mock/backend').then((m) => {
                      m.resetMock()
                      logout()
                    })
                  }
                },
              }}
            >
              <Button type="text" style={{ height: 48 }}>
                <Flex align="center" gap={8}>
                  <Avatar size="small" icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
                  <span>{user.name}</span>
                  <Tag bordered={false} color="blue">
                    {roleLabel(user.role)}
                    {user.approverLevel ? ` · ${user.approverLevel === 'NIVEL_1' ? 'N1' : 'N2'}` : ''}
                  </Tag>
                </Flex>
              </Button>
            </Dropdown>
          </Flex>
        </Header>
        <Content style={{ padding: 24 }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <Routes>
              <Route index element={<DashboardPage />} />
              <Route path="requests" element={<RequestListPage />} />
              <Route path="requests/new" element={<RequestFormPage />} />
              <Route path="requests/:id" element={<RequestDetailPage />} />
              <Route path="requests/:id/edit" element={<RequestFormPage />} />
              <Route
                path="approvals"
                element={
                  <RequireRole roles={['APROVADOR', 'ADMIN']}>
                    <InboxPage />
                  </RequireRole>
                }
              />
              <Route
                path="admin"
                element={
                  <RequireRole roles={['ADMIN']}>
                    <AdminPage />
                  </RequireRole>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
