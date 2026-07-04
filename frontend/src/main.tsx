import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/utils/web3Config'
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

ReactDOM.createRoot(root).render(
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
