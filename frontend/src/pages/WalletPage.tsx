import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useBalance, useChainId, useSwitchChain, useDisconnect } from 'wagmi'
import { formatUnits } from 'viem'
import {
  Wallet, ExternalLink, Copy, RefreshCw, Link2,
  Shield, CheckCircle, AlertCircle, ChevronRight,
  ArrowUpRight, ArrowDownLeft, LogOut, Eye, EyeOff
} from 'lucide-react'
import api from '@/utils/api'
import { fmt, cn } from '@/utils/format'
import { CHAIN_NAMES, CHAIN_NATIVE, CHAIN_EXPLORER, TOKEN_CONTRACTS } from '@/utils/web3Config'
import ConnectWalletModal from '@/components/ui/ConnectWalletModal'
import MoonPayEmbed from '@/components/ui/MoonPayEmbed'
import toast from 'react-hot-toast'

type Tab = 'balances' | 'activity' | 'buy'

export default function WalletPage() {
  const { address, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [tab, setTab] = useState<Tab>('balances')
  const [showConnect, setShowConnect] = useState(false)
  const [showMoonPay, setShowMoonPay] = useState(false)
  const [buyToken, setBuyToken] = useState('ETH')
  const [copied, setCopied] = useState(false)
  const [hideSmall, setHideSmall] = useState(false)

  const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`
  const native    = CHAIN_NATIVE[chainId] || { symbol: 'ETH', name: 'Ethereum', decimals: 18 }
  const explorer  = CHAIN_EXPLORER[chainId] || 'https://etherscan.io'

  // Native balance
  const { data: nativeBal, refetch: refetchNative } = useBalance({
    address: address as `0x${string}`,
    query: { enabled: !!address && isConnected, refetchInterval: 15000 },
  })

  // ERC20 balances from backend (batched RPC)
  const { data: tokenBals, isLoading: balsLoading, refetch: refetchTokens } = useQuery({
    queryKey: ['wallet-balances', address, chainId],
    queryFn: () => api.get(`/wallets/onchain-balances?address=${address}&chainId=${chainId}`).then(r => r.data.data),
    enabled: !!address && isConnected,
    refetchInterval: 30000,
  })

  // Transaction history from backend (platform activity)
  const { data: txData } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.get('/transactions?limit=20').then(r => r.data.data),
    enabled: tab === 'activity',
  })

  const copyAddress = () => {
    navigator.clipboard.writeText(address || '')
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const refreshAll = () => {
    refetchNative()
    refetchTokens()
    toast.success('Balances refreshed')
  }

  // Build full token list
  const allBalances = [
    ...(nativeBal ? [{
      symbol:     native.symbol,
      name:       native.name,
      balance:    formatUnits(nativeBal.value, native.decimals),
      balanceRaw: nativeBal.value.toString(),
      usdValue:   0,
      decimals:   native.decimals,
      isNative:   true,
    }] : []),
    ...(tokenBals || []),
  ].filter(b => !hideSmall || parseFloat(b.balance) > 0.0001)

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white flex items-center gap-2">
            <Wallet size={22} className="text-brand-500"/> Wallet
          </h1>
          <p className="text-sm text-dark-400 mt-0.5">Your crypto — always in your control</p>
        </div>
        <div className="flex gap-2">
          {isConnected && (
            <button onClick={refreshAll} className="btn-secondary btn-sm"><RefreshCw size={13}/></button>
          )}
          <button onClick={() => setShowMoonPay(true)} className="btn-success btn-sm flex items-center gap-1.5">
            <ArrowDownLeft size={14}/> Buy Crypto
          </button>
        </div>
      </div>

      {/* Not connected */}
      {!isConnected ? (
        <div className="card p-10 text-center">
          <div className="w-16 h-16 bg-brand-100 dark:bg-brand-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wallet size={28} className="text-brand-500"/>
          </div>
          <h2 className="text-lg font-bold text-dark-900 dark:text-white mb-2">Connect your wallet</h2>
          <p className="text-dark-400 text-sm mb-2 max-w-xs mx-auto leading-relaxed">
            Connect MetaMask, Coinbase Wallet, or any web3 wallet to see your real balances.
          </p>
          <p className="text-xs text-dark-300 dark:text-dark-500 mb-6">
            Coinbidex never stores your private keys or holds your funds.
          </p>
          <button onClick={() => setShowConnect(true)} className="btn-primary btn-lg">
            <Link2 size={16}/> Connect Wallet
          </button>
        </div>
      ) : (
        <>
          {/* Connected wallet card */}
          <div className="card p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-gradient-to-br from-brand-400 to-brand-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-mono text-xs font-bold">{address?.slice(2,4).toUpperCase()}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-dark-900 dark:text-white">
                      {address?.slice(0,6)}...{address?.slice(-4)}
                    </p>
                    <button onClick={copyAddress} className="text-dark-400 hover:text-brand-500 transition-colors">
                      {copied ? <CheckCircle size={13} className="text-emerald-500"/> : <Copy size={13}/>}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/>
                    <span className="text-xs text-dark-400">{connector?.name} · {chainName}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer"
                  className="btn-ghost btn-sm p-2" title="View on explorer">
                  <ExternalLink size={13}/>
                </a>
                <button onClick={() => disconnect()} className="btn-ghost btn-sm p-2 text-red-400 hover:text-red-500" title="Disconnect">
                  <LogOut size={13}/>
                </button>
              </div>
            </div>

            {/* Chain switcher */}
            <div className="mt-4 flex gap-1.5 overflow-x-auto no-scrollbar">
              <p className="text-xs text-dark-400 self-center mr-1 shrink-0">Network:</p>
              {[1, 137, 56, 10, 42161].map(cid => (
                <button key={cid} onClick={() => switchChain?.({ chainId: cid })}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                    chainId === cid
                      ? 'bg-brand-500 text-white'
                      : 'bg-dark-100 dark:bg-dark-800 text-dark-500 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white'
                  )}>
                  {CHAIN_NAMES[cid]}
                </button>
              ))}
            </div>

            {/* Security notice */}
            <div className="mt-3 flex items-center gap-2 text-xs text-dark-400 bg-dark-50 dark:bg-dark-800/50 rounded-lg px-3 py-2">
              <Shield size={11} className="text-brand-500 shrink-0"/>
              Non-custodial — Coinbidex cannot access or move your funds
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-dark-100 dark:border-dark-800">
            {([['balances','Balances'],['activity','Activity'],['buy','Buy Crypto']] as const).map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} className={tab===k?'tab-active':'tab'}>{l}</button>
            ))}
          </div>

          {/* Balances */}
          {tab === 'balances' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-dark-400 font-medium">
                  {allBalances.length} token{allBalances.length !== 1 ? 's' : ''} on {chainName}
                </p>
                <button onClick={() => setHideSmall(!hideSmall)}
                  className="flex items-center gap-1 text-xs text-dark-400 hover:text-dark-900 dark:hover:text-white transition-colors">
                  {hideSmall ? <Eye size={11}/> : <EyeOff size={11}/>}
                  {hideSmall ? 'Show all' : 'Hide dust'}
                </button>
              </div>

              <div className="card overflow-hidden">
                {balsLoading ? (
                  Array.from({length:4}).map((_,i)=>(
                    <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-dark-100 dark:border-dark-800">
                      <div className="w-9 h-9 bg-dark-100 dark:bg-dark-800 rounded-full animate-pulse"/>
                      <div className="flex-1"><div className="h-4 bg-dark-100 dark:bg-dark-800 rounded w-24 animate-pulse mb-1.5"/><div className="h-3 bg-dark-100 dark:bg-dark-800 rounded w-16 animate-pulse"/></div>
                      <div className="h-4 bg-dark-100 dark:bg-dark-800 rounded w-20 animate-pulse"/>
                    </div>
                  ))
                ) : allBalances.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-dark-400 text-sm">No tokens found on {chainName}</p>
                    <p className="text-dark-300 dark:text-dark-500 text-xs mt-1">Try switching networks or buy crypto below</p>
                    <button onClick={() => setTab('buy')} className="btn-primary btn-sm mt-4">Buy Crypto</button>
                  </div>
                ) : (
                  allBalances.map((b, i) => (
                    <div key={b.symbol} className={cn('flex items-center justify-between px-5 py-3.5 hover:bg-dark-50 dark:hover:bg-dark-800/30 transition-colors', i < allBalances.length-1 && 'border-b border-dark-100 dark:border-dark-800')}>
                      <div className="flex items-center gap-3">
                        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold', b.isNative ? 'bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-400' : 'bg-dark-100 dark:bg-dark-700 text-dark-500 dark:text-dark-300')}>
                          {b.symbol.slice(0,3)}
                        </div>
                        <div>
                          <p className="font-semibold text-dark-900 dark:text-white text-sm">{b.symbol}</p>
                          <p className="text-xs text-dark-400">{b.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold text-dark-900 dark:text-white">{fmt.qty(b.balance, 6)}</p>
                        {b.usdValue > 0 && <p className="text-xs text-dark-400">{fmt.usd(b.usdValue)}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTab('buy')} className="card p-4 flex items-center gap-3 hover:border-brand-200 dark:hover:border-brand-500/30 transition-all group">
                  <div className="w-9 h-9 bg-brand-100 dark:bg-brand-500/10 rounded-xl flex items-center justify-center group-hover:bg-brand-500 transition-colors">
                    <ArrowDownLeft size={16} className="text-brand-500 group-hover:text-white transition-colors"/>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm text-dark-900 dark:text-white">Buy Crypto</p>
                    <p className="text-xs text-dark-400">Card or bank transfer</p>
                  </div>
                </button>
                <a href={`${explorer}/address/${address}`} target="_blank" rel="noopener noreferrer"
                  className="card p-4 flex items-center gap-3 hover:border-brand-200 dark:hover:border-brand-500/30 transition-all group">
                  <div className="w-9 h-9 bg-dark-100 dark:bg-dark-800 rounded-xl flex items-center justify-center group-hover:bg-brand-500 transition-colors">
                    <ExternalLink size={16} className="text-dark-400 group-hover:text-white transition-colors"/>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-sm text-dark-900 dark:text-white">Explorer</p>
                    <p className="text-xs text-dark-400">View on {chainName}</p>
                  </div>
                </a>
              </div>
            </div>
          )}

          {/* Activity */}
          {tab === 'activity' && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-dark-100 dark:border-dark-800 flex items-center justify-between">
                <p className="text-xs font-medium text-dark-400 uppercase tracking-wide">Platform activity</p>
                <p className="text-xs text-dark-300 dark:text-dark-500">On-chain history: view on explorer</p>
              </div>
              <div className="divide-y divide-dark-100 dark:divide-dark-800">
                {txData?.transactions?.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center',
                        t.type==='SWAP'?'bg-brand-100 dark:bg-brand-500/10':'bg-dark-100 dark:bg-dark-800')}>
                        {t.type==='SWAP' ? <ArrowUpRight size={14} className="text-brand-500"/> : <Wallet size={14} className="text-dark-400"/>}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-dark-900 dark:text-white">{t.type.replace('_',' ')}</p>
                        <p className="text-xs text-dark-400">{t.description || t.asset}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-dark-900 dark:text-white">{fmt.qty(Math.abs(t.amount))} {t.asset}</p>
                      <span className={`badge text-[10px] ${t.status==='COMPLETED'?'badge-green':t.status==='FAILED'?'badge-red':'badge-yellow'}`}>{t.status}</span>
                    </div>
                  </div>
                ))}
                {(!txData?.transactions || txData.transactions.length === 0) && (
                  <div className="py-10 text-center text-dark-400 text-sm">No activity yet</div>
                )}
              </div>
            </div>
          )}

          {/* Buy */}
          {tab === 'buy' && (
            <div className="space-y-4">
              <div className="bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 rounded-xl p-4 text-sm text-brand-700 dark:text-brand-300">
                <div className="flex items-start gap-2">
                  <Shield size={14} className="shrink-0 mt-0.5"/>
                  <div>
                    <strong>Powered by MoonPay</strong> — a regulated payment service.
                    Your purchased crypto goes directly to your connected wallet.
                    Coinbidex earns a referral commission and never touches your funds.
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-dark-400 mb-2 block">Select crypto to buy</label>
                <div className="grid grid-cols-4 gap-2">
                  {['ETH','BTC','USDT','BNB','SOL','MATIC','USDC','LINK'].map(sym => (
                    <button key={sym} onClick={() => setBuyToken(sym)}
                      className={cn('py-2 rounded-lg text-sm font-medium transition-all border',
                        buyToken === sym
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-dark-50 dark:bg-dark-800 text-dark-600 dark:text-dark-300 border-dark-200 dark:border-dark-700 hover:border-brand-300 dark:hover:border-brand-500/50'
                      )}>
                      {sym}
                    </button>
                  ))}
                </div>
              </div>
              <MoonPayEmbed symbol={buyToken}/>
            </div>
          )}
        </>
      )}

      {showConnect && <ConnectWalletModal onClose={() => setShowConnect(false)}/>}
    </div>
  )
}
