import { usePlatform } from '@/contexts/PlatformContext'
import { FlaskConical, Zap } from 'lucide-react'

export default function ModeBadge() {
  const { isDemo, demoUrl, liveUrl, mode } = usePlatform()

  return (
    <a
      href={isDemo ? liveUrl : demoUrl}
      title={isDemo ? 'Switch to Live trading' : 'Switch to Demo mode'}
      className={
        isDemo
          ? 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/30 hover:bg-yellow-200 dark:hover:bg-yellow-500/25 transition-colors'
          : 'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-200 dark:hover:bg-emerald-500/20 transition-colors'
      }
    >
      {isDemo
        ? <><FlaskConical size={11}/> DEMO</>
        : <><Zap size={11}/> LIVE</>
      }
    </a>
  )
}
