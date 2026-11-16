/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK_BACKEND?: string
  readonly VITE_DEMO_LOGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Compile-time flags injected by vite.config.ts (`define`) — see src/shared/config.ts
declare const __USE_MOCK_BACKEND__: boolean
declare const __SHOW_DEMO_LOGIN__: boolean
