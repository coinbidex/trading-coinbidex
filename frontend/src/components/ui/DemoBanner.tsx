import { useState } from 'react'
import { usePlatform } from '@/contexts/PlatformContext'
import { FlaskConical, X, ArrowRight, Info } from 'lucide-react'

export default function DemoBanner() {
  const { isDemo, liveUrl } = usePlatform()
  const [dismissed, setDismissed] = useState(false)

  if (!isDemo || dismissed) return null

  return (
    <div className="bg-yellow-500 text-yellow-950 px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <FlaskConical size={15} className="shrink-0"/>
        <span className="text-sm font-medium truncate">
          <strong>Demo mode</strong> — All balances are fake. Real market prices. No real crypto involved.
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href={liveUrl}
          className="flex items-center gap-1.5 bg-yellow-950 text-yellow-100 hover:bg-yellow-900 px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
        >
          Switch to Live <ArrowRight size={11}/>
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-yellow-400 rounded transition-colors"
          title="Dismiss"
        >
          <X size={13}/>
        </button>
      </div>
    </div>
  )
}
