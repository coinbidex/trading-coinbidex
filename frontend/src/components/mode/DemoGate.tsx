import { ReactNode } from 'react'
import { usePlatformMode } from '@/contexts/PlatformModeContext'
import { FlaskConical, ExternalLink } from 'lucide-react'

interface DemoGateProps {
  children:     ReactNode
  action:       string      // e.g. "execute real on-chain swaps"
  showOverlay?: boolean     // show overlay instead of hiding
  fallback?:    ReactNode   // custom fallback UI
}

// Wraps a real-money action — shows a demo notice instead of the real UI
export function DemoGate({ children, action, showOverlay = true, fallback }: DemoGateProps) {
  const { isDemo } = usePlatformMode()

  if (!isDemo) return <>{children}</>

  if (fallback) return <>{fallback}</>

  if (!showOverlay) return null

  return (
    <div className="relative">
      {/* Blurred underlying content */}
      <div className="opacity-30 pointer-events-none select-none blur-[1px]">
        {children}
      </div>
      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-yellow-50/80 dark:bg-dark-900/80 backdrop-blur-sm rounded-xl border border-yellow-200 dark:border-yellow-500/30">
        <div className="text-center p-6 max-w-xs">
          <FlaskConical size={28} className="text-yellow-500 mx-auto mb-3"/>
          <p className="font-semibold text-dark-900 dark:text-white text-sm mb-1">Demo Mode</p>
          <p className="text-xs text-dark-400 mb-4 leading-relaxed">
            To {action}, you need the Live platform with a real wallet connected.
          </p>
          <a
            href="https://coinbidex.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Open Live Platform <ExternalLink size={11}/>
          </a>
        </div>
      </div>
    </div>
  )
}

// Hook version — for conditional logic
export function useDemoGate() {
  const { isDemo, isLive } = usePlatformMode()

  const checkAction = (action: string, onProceed: () => void) => {
    if (isDemo) {
      // In demo mode, show a toast and don't proceed
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error(`Demo mode: ${action} is only available on the Live platform.`, {
          duration: 4000,
          icon: '🧪',
        })
      })
      return false
    }
    onProceed()
    return true
  }

  return { isDemo, isLive, checkAction }
}

// Simple badge showing current mode
export function ModeBadge({ className = '' }: { className?: string }) {
  const { isDemo, isLive } = usePlatformMode()

  if (isLive) return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold rounded-full border border-emerald-200 dark:border-emerald-500/20 ${className}`}>
      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/>
      LIVE
    </span>
  )

  if (isDemo) return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-[10px] font-semibold rounded-full border border-yellow-200 dark:border-yellow-500/20 ${className}`}>
      <FlaskConical size={9}/>
      DEMO
    </span>
  )

  return null
}
