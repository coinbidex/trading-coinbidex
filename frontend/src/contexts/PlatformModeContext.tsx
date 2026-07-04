import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import api from '@/utils/api'

export type Mode = 'demo' | 'live' | 'unknown'

interface ModeInfo {
  mode:         Mode
  isDemo:       boolean
  isLive:       boolean
  label:        string
  description:  string
  color:        string
  restrictions: string[]
}

interface PlatformModeContextType {
  modeInfo:  ModeInfo
  isLoading: boolean
  isDemo:    boolean
  isLive:    boolean
  mode:      Mode
}

const DEFAULT: ModeInfo = {
  mode:         'unknown',
  isDemo:       false,
  isLive:       false,
  label:        'Loading...',
  description:  '',
  color:        'gray',
  restrictions: [],
}

const PlatformModeContext = createContext<PlatformModeContextType>({
  modeInfo:  DEFAULT,
  isLoading: true,
  isDemo:    false,
  isLive:    false,
  mode:      'unknown',
})

export function PlatformModeProvider({ children }: { children: ReactNode }) {
  const [modeInfo, setModeInfo] = useState<ModeInfo>(DEFAULT)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check the backend's reported mode
    api.get('/mode')
      .then(r => {
        const data = r.data.data as ModeInfo
        setModeInfo(data)
      })
      .catch(() => {
        // Fallback: read from response header on any request
        const envMode = import.meta.env.VITE_PLATFORM_MODE as Mode
        if (envMode === 'demo' || envMode === 'live') {
          setModeInfo({
            mode:         envMode,
            isDemo:       envMode === 'demo',
            isLive:       envMode === 'live',
            label:        envMode === 'demo' ? 'Demo Mode' : 'Live Mode',
            description:  envMode === 'demo' ? 'Paper trading — no real money' : 'Real wallets and assets',
            color:        envMode === 'demo' ? 'yellow' : 'green',
            restrictions: envMode === 'demo' ? ['Real on-chain swaps disabled'] : [],
          })
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <PlatformModeContext.Provider value={{
      modeInfo,
      isLoading,
      isDemo: modeInfo.isDemo,
      isLive: modeInfo.isLive,
      mode:   modeInfo.mode,
    }}>
      {children}
    </PlatformModeContext.Provider>
  )
}

export const usePlatformMode = () => useContext(PlatformModeContext)
