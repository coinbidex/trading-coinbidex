import { useState } from 'react'
import { useConnect } from 'wagmi'
import { X, Wallet, ChevronRight, Loader, AlertCircle, ExternalLink, Smartphone } from 'lucide-react'
import { cn } from '@/utils/format'

interface Props { onClose: () => void }

// Wallet display metadata
const WALLET_META: Record<string, { name: string; desc: string; icon: string; popular?: boolean }> = {
  metaMask:      { name: 'MetaMask',            desc: 'Browser extension wallet',              icon: '🦊', popular: true },
  injected:      { name: 'Browser Wallet',       desc: 'MetaMask, Brave, Trust browser',        icon: '🌐' },
  coinbaseWallet:{ name: 'Coinbase Wallet',      desc: 'Coinbase self-custody wallet',          icon: '🔵' },
  walletConnect: { name: 'WalletConnect',        desc: 'Scan QR with any mobile wallet',        icon: '🔗', popular: true },
}

const MOBILE_WALLETS = [
  { name: 'Trust Wallet',  icon: '🛡️' },
  { name: 'Rainbow',       icon: '🌈' },
  { name: 'Argent',        icon: '🟦' },
  { name: 'Zerion',        icon: '⚡' },
  { name: 'MetaMask',      icon: '🦊' },
  { name: '300+ more',     icon: '➕' },
]

export default function ConnectWalletModal({ onClose }: Props) {
  const { connect, connectors, isPending } = useConnect()
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const handleConnect = async (connector: any) => {
    setError(null)
    setConnecting(connector.id)
    try {
      connect({ connector })
      // WalletConnect opens its own QR modal — close ours
      if (connector.id === 'walletConnect') {
        setTimeout(onClose, 500)
      }
    } catch (err: any) {
      const msg = err?.message || 'Connection failed'
      if (msg.includes('User rejected') || msg.includes('user rejected')) {
        setError('Connection rejected in wallet')
      } else if (msg.includes('already pending')) {
        setError('Check your wallet for a pending request')
      } else {
        setError(msg)
      }
      setConnecting(null)
    }
  }

  // Deduplicate connectors
  const seen = new Set<string>()
  const unique = connectors.filter(c => {
    const key = c.id
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const hasWalletConnect = unique.some(c => c.id === 'walletConnect')

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm bg-white dark:bg-dark-900 border border-dark-100 dark:border-dark-800 rounded-2xl shadow-2xl animate-slide-up overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-100 dark:border-dark-800">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-brand-500"/>
            <span className="font-semibold text-dark-900 dark:text-white">Connect wallet</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-dark-400 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors"
          >
            <X size={14}/>
          </button>
        </div>

        <div className="p-4 space-y-2">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle size={13} className="shrink-0 mt-0.5"/>
              <span>{error}</span>
            </div>
          )}

          {/* Connectors */}
          {unique.map(connector => {
            const meta = WALLET_META[connector.id] || { name: connector.name, desc: 'Connect wallet', icon: '💼' }
            const isThis = connecting === connector.id && isPending
            const isWC   = connector.id === 'walletConnect'

            return (
              <button
                key={connector.uid}
                onClick={() => handleConnect(connector)}
                disabled={isPending}
                className={cn(
                  'w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left group',
                  'border-dark-200 dark:border-dark-700',
                  'hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/5',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  isThis && 'border-brand-400 bg-brand-50 dark:bg-brand-500/5'
                )}
              >
                <span className="text-2xl w-9 text-center leading-none shrink-0">{meta.icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-dark-900 dark:text-white">{meta.name}</p>
                    {meta.popular && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-brand-100 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400 rounded-full">
                        Popular
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-dark-400 mt-0.5">{meta.desc}</p>
                  {/* Show mobile wallet icons under WalletConnect */}
                  {isWC && (
                    <div className="flex items-center gap-1 mt-2">
                      {MOBILE_WALLETS.map(w => (
                        <span key={w.name} className="text-base" title={w.name}>{w.icon}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                  {isThis
                    ? <Loader size={16} className="text-brand-500 animate-spin"/>
                    : isWC
                      ? <Smartphone size={15} className="text-dark-400 group-hover:text-brand-500 transition-colors"/>
                      : <ChevronRight size={15} className="text-dark-400 group-hover:text-brand-500 transition-colors"/>
                  }
                </div>
              </button>
            )
          })}

          {/* If no WalletConnect — show info */}
          {!hasWalletConnect && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-dark-200 dark:border-dark-800 bg-dark-50 dark:bg-dark-900/50">
              <span className="text-2xl w-9 text-center">🔗</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-dark-500 dark:text-dark-400">WalletConnect</p>
                <p className="text-xs text-dark-400 mt-0.5">Trust, Rainbow + 300 mobile wallets</p>
              </div>
              <a
                href="https://cloud.walletconnect.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-500 hover:text-brand-600 whitespace-nowrap flex items-center gap-1 font-medium"
              >
                Enable <ExternalLink size={10}/>
              </a>
            </div>
          )}

          {/* MetaMask not installed helper */}
          {!unique.some(c => c.id === 'metaMask' || c.id === 'injected') && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-3 py-2.5">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">No wallet detected</p>
              <a
                href="https://metamask.io/download"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-500 hover:underline flex items-center gap-1"
              >
                Install MetaMask <ExternalLink size={10}/>
              </a>
            </div>
          )}

          <p className="text-xs text-dark-400 text-center pt-1 leading-relaxed">
            Non-custodial — we never hold your keys or funds
          </p>
        </div>
      </div>
    </div>
  )
}
