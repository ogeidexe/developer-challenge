import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Divider, Flex, Form, Input, Segmented, Select, Typography, theme } from 'antd'
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from '../../shared/auth/AuthContext'
import { safeReturnUrl } from '../../shared/auth/safeReturnUrl'
import { SHOW_DEMO_LOGIN } from '../../shared/config'
import { api } from '../../shared/api/client'
import { errText, serverFieldErrors } from '../../shared/ui'

type Mode = 'login' | 'register'
interface Values {
  email: string
  password: string
  name?: string
  costCenterId?: string
}

// Demo accounts of the seed (README §5.4). Rendered only when SHOW_DEMO_LOGIN — removed from production builds (SEC-F04).
const DEMO_PASSWORD = 'Kingspan@123'
const DEMO_USERS = [
  { value: 'admin1@kingspan.test', label: 'Admin Um — ADMIN (global)' },
  { value: 'admin2@kingspan.test', label: 'Admin Dois — ADMIN (global)' },
  { value: 'aprov1.ti@kingspan.test', label: 'João Nunes — Aprovador N1 · CC-TI-01' },
  { value: 'aprov2.ti@kingspan.test', label: 'Maria Souza — Aprovador N2 · CC-TI-01' },
  { value: 'solic.ti@kingspan.test', label: 'Sofia Lima — Solicitante · CC-TI-01' },
  { value: 'aprov1.adm@kingspan.test', label: 'Ana Costa — Aprovador N1 · CC-ADM-02' },
  { value: 'aprov2.adm@kingspan.test', label: 'Pedro Alves — Aprovador N2 · CC-ADM-02' },
  { value: 'solic.adm@kingspan.test', label: 'Carlos Reis — Solicitante · CC-ADM-02' },
]

export function LoginPage() {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { token } = theme.useToken()
  const [form] = Form.useForm<Values>()
  const [mode, setMode] = useState<Mode>('login')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data: centers } = useQuery({
    queryKey: ['centers-public'],
    queryFn: api.listCostCenters,
    enabled: mode === 'register',
  })

  const returnUrl = safeReturnUrl(params.get('returnUrl')) // SEC-F02: same-origin paths only
  if (user) return <Navigate to={returnUrl} replace />

  async function onFinish(values: Values) {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') await login(values.email, values.password)
      else await register(values.email, values.password, values.name!, values.costCenterId!)
      navigate(returnUrl, { replace: true })
    } catch (e) {
      const fields = serverFieldErrors(e)
      if (fields) form.setFields(fields as never)
      else setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', background: token.colorBgLayout, padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 440 }}>
        <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
          Solicitações de Compra
        </Typography.Title>
        <Typography.Paragraph type="secondary">Kingspan · ambiente de demonstração</Typography.Paragraph>

        <Segmented<Mode>
          block
          value={mode}
          style={{ marginBottom: 20 }}
          options={[
            { value: 'login', label: 'Entrar' },
            { value: 'register', label: 'Criar conta' },
          ]}
          onChange={(m) => {
            setMode(m)
            setError(null)
          }}
        />

        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

        <Form<Values>
          name="login"
          form={form}
          layout="vertical"
          requiredMark={false}
          onFinish={onFinish}
          initialValues={SHOW_DEMO_LOGIN ? { email: 'admin1@kingspan.test', password: DEMO_PASSWORD } : undefined}
        >
          {mode === 'register' && (
            <>
              <Form.Item
                name="name"
                label="Nome completo"
                rules={[
                  { required: true, message: 'Informe seu nome' },
                  { min: 2, max: 120 },
                ]}
              >
                <Input prefix={<UserOutlined />} />
              </Form.Item>
              <Form.Item
                name="costCenterId"
                label="Centro de custo"
                rules={[{ required: true, message: 'Selecione o centro de custo' }]}
              >
                <Select
                  placeholder="Selecione…"
                  options={(centers ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="email"
            label="E-mail"
            rules={[{ required: true, type: 'email', message: 'E-mail inválido' }]}
          >
            <Input prefix={<MailOutlined />} autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Senha"
            rules={[{ required: true, min: 8, message: 'Mínimo de 8 caracteres' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={busy}>
            {mode === 'login' ? 'Entrar' : 'Criar conta (Solicitante) e entrar'}
          </Button>
        </Form>

        {SHOW_DEMO_LOGIN && mode === 'login' && (
          <>
            <Divider plain style={{ fontSize: 12 }}>
              Usuários de demonstração (senha {DEMO_PASSWORD})
            </Divider>
            <Select
              style={{ width: '100%' }}
              placeholder="Preencher com um usuário do seed…"
              options={DEMO_USERS}
              onChange={(email: string) => form.setFieldsValue({ email, password: DEMO_PASSWORD })}
            />
          </>
        )}
      </Card>
    </Flex>
  )
}
