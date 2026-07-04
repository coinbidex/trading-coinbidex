import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],

    resolve: {
      alias: { '@': path.resolve(__dirname, './src') }
    },

    define: {
      global: 'globalThis',
    },

    server: {
      host: '0.0.0.0',
      port: 3000,
      // Allow any host — needed when running behind nginx on a VPS
      allowedHosts: 'all',
      proxy: {
        '/api': {
          target: env.VITE_API_BASE || 'http://backend-live:4000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: env.VITE_API_BASE || 'http://backend-live:4000',
          ws: true,
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            wagmi:  ['wagmi', 'viem'],
            charts: ['lightweight-charts', 'recharts'],
            query:  ['@tanstack/react-query'],
          }
        }
      }
    },
  }
})
