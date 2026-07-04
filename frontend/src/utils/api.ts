import axios, { AxiosInstance } from 'axios'

// Base URL: empty string = relative URLs = Nginx/Vite proxy handles routing
// VITE_API_BASE only set in demo mode to point to port 4001
const BASE = import.meta.env.VITE_API_BASE
  ? `${import.meta.env.VITE_API_BASE}/api/v1`
  : '/api/v1'

const api: AxiosInstance = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT from store on every request
api.interceptors.request.use(config => {
  try {
    // DO NOT ATTACH TOKENS TO LOGIN/REGISTER
    const publicRoutes = [
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
    ]

    const isPublic = publicRoutes.some(route =>
      config.url?.includes(route)
    )

    if (isPublic) {
      return config
    }

    const raw = localStorage.getItem('coinbidex-auth')

    if (raw) {
      const { state } = JSON.parse(raw)

      if (state?.accessToken) {
        config.headers.Authorization = `Bearer ${state.accessToken}`
      }
    }
  } catch {
    // Ignore
  }

  return config
})

// Token refresh on 401
let isRefreshing = false

type QueueItem = {
  resolve: (token: string) => void
  reject: (err: unknown) => void
}

let queue: QueueItem[] = []

function processQueue(err: unknown, token: string | null) {
  queue.forEach(p => {
    if (err) {
      p.reject(err)
    } else {
      p.resolve(token!)
    }
  })

  queue = []
}

api.interceptors.response.use(
  res => res,

  async err => {
    const original = err.config

    // PUBLIC ROUTES SHOULD NEVER TRIGGER REFRESH
    const publicRoutes = [
      '/auth/login',
      '/auth/register',
      '/auth/refresh',
    ]

    const isPublic = publicRoutes.some(route =>
      original?.url?.includes(route)
    )

    if (isPublic) {
      return Promise.reject(err)
    }

    // ONLY HANDLE 401
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err)
    }

    original._retry = true

    // WAIT FOR ACTIVE REFRESH
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        queue.push({ resolve, reject })
      }).then(token => {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      })
    }

    isRefreshing = true

    try {
      const raw = localStorage.getItem('coinbidex-auth')

      // NO AUTH STATE = USER NOT LOGGED IN
      if (!raw) {
        return Promise.reject(err)
      }

      const parsed = JSON.parse(raw)

      const refreshToken = parsed?.state?.refreshToken

      // NO REFRESH TOKEN = NORMAL GUEST USER
      if (!refreshToken) {
        return Promise.reject(err)
      }

      const response = await axios.post(
        `${BASE}/auth/refresh`,
        {
          refreshToken,
        }
      )

      const {
        accessToken,
        refreshToken: newRefreshToken,
      } = response.data.data

      // UPDATE STORAGE
      parsed.state.accessToken = accessToken
      parsed.state.refreshToken = newRefreshToken

      localStorage.setItem(
        'coinbidex-auth',
        JSON.stringify(parsed)
      )

      processQueue(null, accessToken)

      original.headers.Authorization = `Bearer ${accessToken}`

      return api(original)
    } catch (refreshErr) {
      processQueue(refreshErr, null)

      // SESSION EXPIRED
      localStorage.removeItem('coinbidex-auth')

      // ONLY REDIRECT IF USER WAS ACTUALLY LOGGED IN
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }

      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
