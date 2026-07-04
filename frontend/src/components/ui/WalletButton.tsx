import { useState } from 'react'
import { useAccount, useDisconnect, useChainId, useSwitchChain, useBalance } from 'wagmi'
import { formatUnits } from 'viem'
import ConnectWalletModal from './ConnectWalletModal'
import {
  Wallet, ChevronDown, Copy, LogOut,
  ExternalLink, RefreshCw, AlertTriangle
} from 'lucide-react'
import { CHAIN_NAMES, CHAIN_NATIVE, CHAIN_EXPLORER, SUPPORTED_CHAINS } from '@/utils/web3Config'
import { fmt, cn } from '@/utils/format'
import toast from 'react-hot-toast'

export default function WalletButton() {
  const { address, isConnected, isConnecting, connector } = useAccount()
  const { disconnect }   = useDisconnect()
  const chainId          = useChainId()
  const { switchChain }  = useSwitchChain()

  const { data: nativeBal, refetch } = useBalance({
    address: address as `0x${string}`,
    query: { enabled: !!address && isConnected, refetchInterval: 15000 },
  })

  const [showModal,    setShowModal]    = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const isUnsupportedChain = isConnected && !SUPPORTED_CHAINS.some(c => c.id === chainId)

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

  const copyAddress = () => {
    navigator.clipboard.writeText(address || '')
    toast.success('Address copied!')
    setShowDropdown(false)
  }

  const nativeSymbol  = CHAIN_NATIVE[chainId]?.symbol || 'ETH'
  const nativeBalance = nativeBal ? parseFloat(formatUnits(nativeBal.value, 18)) : null
  const explorer      = CHAIN_EXPLORER[chainId] || 'https://etherscan.io'

  // ── Not connected ──────────────────────────────────────────
  if (!isConnected) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          disabled={isConnecting}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-all"
        >
          <Wallet size={14}/>
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {showModal && <ConnectWalletModal onClose={() => setShowModal(false)}/>}
      </>
    )
  }

  // ── Wrong chain warning ────────────────────────────────────
  if (isUnsupportedChain) {
    return (
      <button
        onClick={() => switchChain?.({ chainId: 1 })}
        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 text-sm font-medium rounded-xl transition-all"
      >
        <AlertTriangle size={13}/>
        Wrong network
      </button>
    )
  }

  // ── Connected ──────────────────────────────────────────────
  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all',
          'bg-emerald-50 dark:bg-emerald-500/10',
          'border-emerald-200 dark:border-emerald-500/20',
          'hover:border-emerald-400 dark:hover:border-emerald-500/40',
        )}
      >
        {/* Green connected dot */}
        <span className="w-2 h-2 bg-emerald-500 rounded-full shrink-0"/>

        {/* Truncated address in green */}
        <span className="text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-400">
          {truncate(address!)}
        </span>

        {/* Native balance */}
        {nativeBalance !== null && (
          <span className="hidden sm:block text-xs font-mono text-dark-500 dark:text-dark-400 border-l border-dark-200 dark:border-dark-700 pl-2">
            {nativeBalance.toFixed(4)} {nativeSymbol}
          </span>
        )}

        <ChevronDown size={12} className="text-dark-400 shrink-0"/>
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowDropdown(false)}/>
          <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-dark-900 border border-dark-100 dark:border-dark-800 rounded-2xl shadow-2xl z-40 overflow-hidden">

            {/* Wallet info header */}
            <div className="p-4 bg-emerald-50 dark:bg-emerald-500/5 border-b border-dark-100 dark:border-dark-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"/>
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Connected</span>
                </div>
                <span className="text-xs text-dark-400">{connector?.name}</span>
              </div>

              {/* Full address */}
              <p className="font-mono text-sm font-semibold text-dark-900 dark:text-white break-all">
                {address}
              </p>

              {/* Chain + balance */}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs px-2 py-0.5 bg-dark-100 dark:bg-dark-800 text-dark-500 dark:text-dark-400 rounded-full">
                  {CHAIN_NAMES[chainId] || `Chain ${chainId}`}
                </span>
                {nativeBalance !== null && (
                  <span className="text-xs font-mono text-dark-600 dark:text-dark-300">
                    {nativeBalance.toFixed(6)} {nativeSymbol}
                  </span>
                )}
              </div>
            </div>

            {/* Switch network */}
            <div className="p-3 border-b border-dark-100 dark:border-dark-800">
              <p className="text-xs text-dark-400 font-medium mb-2">Switch network</p>
              <div className="grid grid-cols-3 gap-1.5">
                {SUPPORTED_CHAINS.map(chain => (
                  <button
                    key={chain.id}
                    onClick={() => { switchChain?.({ chainId: chain.id }); setShowDropdown(false) }}
                    className={cn(
                      'py-1.5 px-2 rounded-lg text-xs font-medium transition-all text-center',
                      chain.id === chainId
                        ? 'bg-brand-500 text-white'
                        : 'bg-dark-100 dark:bg-dark-800 text-dark-500 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white'
                    )}
                  >
                    {CHAIN_NAMES[chain.id]}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="p-2">
              <button
                onClick={copyAddress}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-dark-600 dark:text-dark-300 hover:text-dark-900 dark:hover:text-white hover:bg-dark-50 dark:hover:bg-dark-800 rounded-xl transition-colors"
              >
                <Copy size={14}/> Copy address
              </button>
              <button
                onClick={() => { refetch(); toast.success('Balance refreshed') }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-dark-600 dark:text-dark-300 hover:text-dark-900 dark:hover:text-white hover:bg-dark-50 dark:hover:bg-dark-800 rounded-xl transition-colors"
              >
                <RefreshCw size={14}/> Refresh balance
              </button>
              <a
                href={`${explorer}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowDropdown(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-dark-600 dark:text-dark-300 hover:text-dark-900 dark:hover:text-white hover:bg-dark-50 dark:hover:bg-dark-800 rounded-xl transition-colors"
              >
                <ExternalLink size={14}/> View on explorer
              </a>
              <button
                onClick={() => { disconnect(); setShowDropdown(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/5 rounded-xl transition-colors"
              >
                <LogOut size={14}/> Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
