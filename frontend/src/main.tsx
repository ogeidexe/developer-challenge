import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider, type ThemeConfig } from 'antd'
import ptBR from 'antd/locale/pt_BR'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import { App } from './App'
import { AuthProvider } from './shared/auth/AuthContext'
import './index.css'

dayjs.locale('pt-br')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // retry only server/network failures — never 4xx (403/404/409/422 are answers, not glitches)
      retry: (count, err: unknown) => {
        const status = (err as { status?: number }).status
        return count < 2 && (status === undefined || status >= 500)
      },
    },
  },
})

// Design tokens live here instead of ad-hoc inline colors (antd 5 theming).
const theme: ThemeConfig = {
  token: {
    colorPrimary: '#0b5cad',
    borderRadius: 8,
    fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  components: {
    Layout: { headerBg: '#ffffff', siderBg: '#0f1f33', headerPadding: '0 24px' },
    Menu: { darkItemBg: '#0f1f33', darkSubMenuItemBg: '#0f1f33' },
    Table: { headerBg: '#fafafa' },
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={ptBR} theme={theme}>
      {/* <AntApp> provides context-aware message/modal/notification via App.useApp() */}
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
)
