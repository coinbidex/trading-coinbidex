import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '@/utils/api'
import { updateSocketAuth } from '@/utils/socket'

const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000

let inactivityTimer: any = null

const startInactivityTimer = (logout: () => Promise<void>) => {
  const reset = () => {
    clearTimeout(inactivityTimer)

    inactivityTimer = setTimeout(async () => {
      await logout()
      window.location.href = '/login'
    }, INACTIVITY_TIMEOUT)
  }

  ;['click', 'keydown', 'mousemove', 'scroll'].forEach(event => {
    window.removeEventListener(event, reset)
    window.addEventListener(event, reset)
  })

  reset()
}

export interface AuthUser {
  id: string
  email: string
  username: string
  role: 'ADMIN' | 'TRADER' | 'MARKET_MAKER'
  kycStatus: string
  twoFactorEnabled: boolean
  emailVerified: boolean
  referralCode: string | null
  avatarUrl: string | null
}

interface RegisterData {
  email: string
  username: string
  password: string
  referralCode?: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  setUser: (user: AuthUser) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null })

        try {
          const res = await api.post('/auth/login', {
            email,
            password,
          })

          const data = res.data.data

          api.defaults.headers.common[
            'Authorization'
          ] = `Bearer ${data.accessToken}`

          updateSocketAuth(data.accessToken)

          set({
            isLoading: false,
            error: null,
            isAuthenticated: true,
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          })

          startInactivityTimer(get().logout)
        } catch (err: any) {
          const msg =
            err?.response?.data?.message ||
            'Login failed'

          set({
            isLoading: false,
            error: msg,
          })

          throw new Error(msg)
        }
      },

      register: async data => {
        set({ isLoading: true, error: null })

        try {
          await api.post('/auth/register', data)

          // DO NOT AUTO LOGIN AFTER REGISTRATION
          set({
            isLoading: false,
            error: null,
            isAuthenticated: false,
            user: null,
            accessToken: null,
            refreshToken: null,
          })
        } catch (err: any) {
          const msg =
            err?.response?.data?.message ||
            'Registration failed'

          set({
            isLoading: false,
            error: msg,
          })

          throw new Error(msg)
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout')
        } catch {}

        delete api.defaults.headers.common['Authorization']

        clearTimeout(inactivityTimer)

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        })
      },

      clearError: () => set({ error: null }),

      setUser: user => set({ user }),
    }),
    {
      name: 'coinbidex-auth',

      partialize: s => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
)
