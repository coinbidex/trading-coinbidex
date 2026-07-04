/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PLATFORM_MODE: string
  readonly VITE_APP_TITLE: string
  readonly VITE_DEMO_BANNER: string
  readonly VITE_API_BASE: string
  readonly VITE_WS_URL: string
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  readonly VITE_DEMO_URL: string
  readonly VITE_LIVE_URL: string
  readonly VITE_ETH_RPC: string
  readonly VITE_POLY_RPC: string
  readonly VITE_BSC_RPC: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
