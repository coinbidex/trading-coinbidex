import { useState } from 'react'
import { usePlatformMode } from '@/contexts/PlatformModeContext'
import { FlaskConical, Zap, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ModeBanner() {
  const { isDemo, isLive, modeInfo, isLoading } = usePlatformMode()
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (isLoading || dismissed) return null

  if (isLive) {
    // Live mode: small green pill — minimal UI, just confirmation
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 border-b border-emerald-100 dark:border-emerald-500/20">
        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0"/>
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Live Mode — Real wallets · Real assets · On-chain execution
        </span>
        <button onClick={() => setDismissed(true)} className="ml-auto text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300">
          <X size={12}/>
        </button>
      </div>
    )
  }

  if (isDemo) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-500/10 border-b border-yellow-200 dark:border-yellow-500/20">
        <div className="flex items-center gap-2 px-4 py-2">
          <FlaskConical size={14} className="text-yellow-600 dark:text-yellow-400 shrink-0"/>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">
              DEMO MODE
            </span>
            <span className="text-xs text-yellow-600 dark:text-yellow-500 ml-2">
              Paper trading only — no real money involved. All prices are live.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-300 transition-colors"
            >
              Learn more {expanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="px-4 pb-3 animate-slide-up">
            <div className="bg-yellow-100 dark:bg-yellow-500/10 rounded-xl p-4 text-xs space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-1.5">
                    <FlaskConical size={12}/> What demo mode means
                  </p>
                  <ul className="space-y-1 text-yellow-700 dark:text-yellow-400">
                    <li className="flex items-center gap-1.5">✓ Live prices from global markets</li>
                    <li className="flex items-center gap-1.5">✓ Real order matching engine</li>
                    <li className="flex items-center gap-1.5">✓ All platform features available</li>
                    <li className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500">✕ No real money or crypto</li>
                    <li className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500">✕ On-chain wallet txs blocked</li>
                    <li className="flex items-center gap-1.5 text-yellow-600 dark:text-yellow-500">✕ Demo funds only (reset anytime)</li>
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2 flex items-center gap-1.5">
                    <Zap size={12}/> Ready to trade for real?
                  </p>
                  <p className="text-yellow-700 dark:text-yellow-400 leading-relaxed mb-3">
                    The live platform uses real wallets (MetaMask, WalletConnect) and real on-chain execution via 1inch DEX aggregator. Your funds never leave your wallet.
                  </p>
                  <a
                    href="https://coinbidex.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    <Zap size={11}/> Go to Live Platform <ExternalLink size={10}/>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
