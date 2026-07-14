import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { WagmiProvider } from 'wagmi'
import { buildWagmiConfig, setWagmiConfig } from '@/utils/web3Config'
import { ThemeProvider }    from '@/contexts/ThemeContext'
import { PlatformProvider } from '@/contexts/PlatformContext'
import App from './App'
import './index.css'

document.title = import.meta.env.VITE_APP_TITLE || 'Coinbidex'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry:                1,
      staleTime:            30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect:   true,
    },
    mutations: {
      retry: 0,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

function renderApp(wagmiConfig: ReturnType<typeof buildWagmiConfig>) {
  ReactDOM.createRoot(root!).render(
    <React.StrictMode>
      <PlatformProvider>
        <ThemeProvider>
          <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter>
                <App />
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    className: [
                      'dark:!bg-dark-800 dark:!text-white',
                      '!bg-white !text-dark-900',
                      '!border !border-dark-200 dark:!border-dark-700',
                      '!shadow-lg',
                    ].join(' '),
                    success: { iconTheme: { primary: '#1a56ff', secondary: '#fff' } },
                    error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
                  }}
                />
              </BrowserRouter>
            </QueryClientProvider>
          </WagmiProvider>
        </ThemeProvider>
      </PlatformProvider>
    </React.StrictMode>
  )
}

// Fetch the admin-configured, non-secret runtime config (WalletConnect
// project ID, active swap widget) before the first render, so wallet
// connectors reflect whatever was saved in the admin panel — not just a
// build-time env var. Falls back to the env-only config if the request
// fails or times out, so the app never hangs waiting on this.
async function bootstrap() {
  let projectId = ''
  try {
    const base = import.meta.env.VITE_API_BASE ? `${import.meta.env.VITE_API_BASE}/api/v1` : '/api/v1'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`${base}/config/public`, { signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const json = await res.json()
      projectId = json?.data?.walletConnectProjectId || ''
    }
  } catch {
    // Network/backend unavailable — fall back to env-var-only config below.
  }

  const cfg = buildWagmiConfig(projectId)
  setWagmiConfig(cfg)
  renderApp(cfg)
}

bootstrap()
