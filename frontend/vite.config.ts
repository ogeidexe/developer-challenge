import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDevServer = command === 'serve' // `npm run dev` and the Cypress runner
  // SEC-F04 — compile-time flags (literal true/false), so a disabled feature is dead code and is removed from
  // the bundle together with what only it imports (the fake backend and its seed, the demo credentials).
  // `vite --mode api` (npm run dev:api) = dev server against the real backend, without an env file
  const useRealApi = mode === 'api'
  const useMockBackend =
    env.VITE_MOCK_BACKEND === 'true' || (env.VITE_MOCK_BACKEND !== 'false' && isDevServer && !useRealApi)
  const showDemoLogin =
    env.VITE_DEMO_LOGIN === 'true' || (env.VITE_DEMO_LOGIN !== 'false' && (isDevServer || useMockBackend))

  return {
    plugins: [react()],
    define: {
      __USE_MOCK_BACKEND__: JSON.stringify(useMockBackend),
      __SHOW_DEMO_LOGIN__: JSON.stringify(showDemoLogin),
    },
    server: {
      port: 5173,
      proxy: {
        // same rewrite as the nginx image: /api/x -> <backend>/x (API_PROXY_TARGET overrides the backend URL)
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
  }
})
