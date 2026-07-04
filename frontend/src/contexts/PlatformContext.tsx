import { createContext, useContext, ReactNode } from 'react'

export type PlatformMode = 'demo' | 'live'

interface PlatformContextType {
  mode:       PlatformMode
  isDemo:     boolean
  isLive:     boolean
  appTitle:   string
  apiBase:    string
  demoUrl:    string
  liveUrl:    string
}

// Read from Vite build-time env vars
const MODE  = (import.meta.env.VITE_PLATFORM_MODE || 'demo') as PlatformMode
const IS_DEMO = MODE === 'demo'

// In production these point to the actual domains
const DEMO_URL = import.meta.env.VITE_DEMO_URL || 'http://localhost:3001'
const LIVE_URL = import.meta.env.VITE_LIVE_URL || 'http://localhost:3000'

const PlatformContext = createContext<PlatformContextType>({
  mode:     MODE,
  isDemo:   IS_DEMO,
  isLive:   !IS_DEMO,
  appTitle: IS_DEMO ? 'Coinbidex Demo' : 'Coinbidex',
  apiBase:  import.meta.env.VITE_API_BASE || '/api/v1',
  demoUrl:  DEMO_URL,
  liveUrl:  LIVE_URL,
})

export function PlatformProvider({ children }: { children: ReactNode }) {
  return (
    <PlatformContext.Provider value={{
      mode:     MODE,
      isDemo:   IS_DEMO,
      isLive:   !IS_DEMO,
      appTitle: IS_DEMO ? 'Coinbidex Demo' : 'Coinbidex',
      apiBase:  import.meta.env.VITE_API_BASE || '/api/v1',
      demoUrl:  DEMO_URL,
      liveUrl:  LIVE_URL,
    }}>
      {children}
    </PlatformContext.Provider>
  )
}

export const usePlatform = () => useContext(PlatformContext)
