import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useChainId, useSwitchChain, useBalance } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import {
  ArrowUpDown, Settings, RefreshCw, CheckCircle, Zap,
  ExternalLink, AlertTriangle, Wallet, Info, ChevronDown,
  Shield, TrendingUp, Clock
} from 'lucide-react'
import api from '@/utils/api'
import { fmt, cn } from '@/utils/format'
import toast from 'react-hot-toast'
import { CHAIN_NAMES, CHAIN_NATIVE, CHAIN_EXPLORER, TOKEN_CONTRACTS } from '@/utils/web3Config'
import { usePlatformMode } from '@/contexts/PlatformModeContext'

// ── Token list for each chain ─────────────────────────────────
const TOKENS_BY_CHAIN: Record<number, Array<{ symbol: string; name: string; icon: string }>> = {
  1: [
    { symbol: 'ETH',   name: 'Ethereum',    icon: '🔷' },
    { symbol: 'USDT',  name: 'Tether USD',  icon: '💚' },
    { symbol: 'USDC',  name: 'USD Coin',    icon: '🔵' },
    { symbol: 'WBTC',  name: 'Wrapped BTC', icon: '🟠' },
    { symbol: 'DAI',   name: 'Dai',         icon: '🟡' },
    { symbol: 'LINK',  name: 'Chainlink',   icon: '🔗' },
    { symbol: 'UNI',   name: 'Uniswap',     icon: '🦄' },
    { symbol: 'AAVE',  name: 'Aave',        icon: '👻' },
    { symbol: 'MATIC', name: 'Polygon',     icon: '🟣' },
  ],
  137: [
    { symbol: 'MATIC', name: 'Polygon',   icon: '🟣' },
    { symbol: 'USDT',  name: 'Tether',    icon: '💚' },
    { symbol: 'USDC',  name: 'USD Coin',  icon: '🔵' },
    { symbol: 'WETH',  name: 'Wrapped ETH', icon: '🔷' },
    { symbol: 'DAI',   name: 'Dai',       icon: '🟡' },
    { symbol: 'LINK',  name: 'Chainlink', icon: '🔗' },
  ],
  56: [
    { symbol: 'BNB',  name: 'BNB',         icon: '🟡' },
    { symbol: 'USDT', name: 'Tether',       icon: '💚' },
    { symbol: 'USDC', name: 'USD Coin',     icon: '🔵' },
    { symbol: 'BTCB', name: 'Bitcoin BEP20',icon: '🟠' },
    { symbol: 'ETH',  name: 'Ethereum BEP20',icon:'🔷' },
    { symbol: 'DAI',  name: 'Dai',          icon: '🟡' },
  ],
}

const DEFAULT_TOKENS = TOKENS_BY_CHAIN[1]

export default function SwapPage() {
  const qc = useQueryClient()
  const { address, isConnected } = useAccount()
  const { isDemo, isLive } = usePlatformMode()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const [fromToken, setFromToken] = useState('ETH')
  const [toToken,   setToToken]   = useState('USDT')
  const [fromAmount, setFromAmount] = useState('')
  const [slippage, setSlippage]     = useState(0.5)
  const [showSettings, setShowSettings] = useState(false)
  const [showFromList, setShowFromList] = useState(false)
  const [showToList,   setShowToList]   = useState(false)
  const [txHash, setTxHash]             = useState<`0x${string}` | undefined>()
  const [swapStep, setSwapStep]         = useState<'idle'|'quoting'|'confirming'|'pending'|'done'|'error'>('idle')

  const tokens = TOKENS_BY_CHAIN[chainId] || DEFAULT_TOKENS
  const chainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`
  const explorer  = CHAIN_EXPLORER[chainId] || 'https://etherscan.io'

  // Native balance
  const { data: nativeBal } = useBalance({
    address: address as `0x${string}`,
    query: { enabled: !!address && isConnected, refetchInterval: 15000 },
  })

  // Wagmi send tx hook
  const { sendTransactionAsync } = useSendTransaction()

  // Wait for tx confirmation
  const { data: receipt, isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (txConfirmed && receipt) {
      setSwapStep('done')
      toast.success('Swap confirmed on-chain!')
      qc.invalidateQueries({ queryKey: ['wallet-balances'] })
    }
  }, [txConfirmed, receipt])

  // Get quote from backend (which calls 1inch)
  const { data: quote, isLoading: quoteLoading, refetch: refetchQuote } = useQuery({
    queryKey: ['swap-quote', fromToken, toToken, fromAmount, chainId],
    queryFn: () => api.get(`/swaps/quote?fromAsset=${fromToken}&toAsset=${toToken}&fromAmount=${fromAmount}&chainId=${chainId}`)
      .then(r => r.data.data),
    enabled: !!fromAmount && parseFloat(fromAmount) > 0 && fromToken !== toToken,
    staleTime: 15000,
    refetchInterval: 30000,
  })

  const flip = () => {
    setFromToken(toToken)
    setToToken(fromToken)
    setFromAmount('')
  }

  const canSwap = isConnected && quote && fromAmount && parseFloat(fromAmount) > 0 && swapStep === 'idle'

  const executeSwap = useCallback(async () => {
    if (!address || !quote) return

    // In demo mode: simulate the swap without blockchain interaction
    if (isDemo) {
      setSwapStep('confirming')
      await new Promise(r => setTimeout(r, 1500))
      setSwapStep('done')
      // Record internally so balance updates
      try {
        await api.post('/swaps/execute', {
          fromAsset: fromToken, toAsset: toToken,
          fromAmount: parseFloat(fromAmount), slippage,
        })
        qc.invalidateQueries({ queryKey: ['wallets'] })
        import('react-hot-toast').then(({ default: t }) =>
          t.success(`Demo swap: ${fromAmount} ${fromToken} → ${fmt.qty(parseFloat(quote.toAmount),6)} ${toToken}`)
        )
      } catch {}
      return
    }

    setSwapStep('confirming')

    try {
      // Ask backend to build the 1inch transaction
      const res = await api.post('/swaps/build-onchain', {
        fromAsset:     fromToken,
        toAsset:       toToken,
        fromAmount:    parseFloat(fromAmount),
        walletAddress: address,
        slippage,
        chainId,
      })

      if (!res.data.success) throw new Error(res.data.message)

      const tx = res.data.data.tx
      setSwapStep('pending')

      // MetaMask / wallet popup appears — user signs
      const hash = await sendTransactionAsync({
        to:    tx.to    as `0x${string}`,
        value: tx.value ? BigInt(tx.value) : 0n,
        data:  tx.data  as `0x${string}`,
        gas:   tx.gas   ? BigInt(Math.ceil(parseInt(tx.gas) * 1.2)) : undefined, // 20% gas buffer
      })

      setTxHash(hash)
      toast.success('Transaction submitted! Waiting for confirmation...')
    } catch (err: any) {
      const raw = err?.shortMessage || err?.response?.data?.message || err?.message || ''

      let userMsg = 'Swap failed. Please try again.'

      if (raw.includes('User rejected') || raw.includes('user rejected')) {
        userMsg = 'Transaction cancelled.'
        setSwapStep('idle')
      } else if (raw.includes('Insufficient balance') || raw.includes('Not enough')) {
        userMsg = "Insufficient balance. Add funds to your wallet."
      } else if (raw.includes('insufficient funds')) {
        userMsg = "Not enough ETH for gas fees."
      } else if (raw.includes('slippage')) {
        userMsg = "Price moved too fast. Increase slippage in ⚙️ settings."
      } else if (raw.includes('liquidity')) {
        userMsg = "Not enough liquidity. Try a smaller amount."
      } else if (raw.includes('timeout')) {
        userMsg = "Request timed out. Please try again."
      } else if (raw.includes('allowance')) {
        userMsg = "Token approval needed. Please approve first."
      } else if (raw.includes('Not enough ETH') || raw.includes('ETH balance')) {
        userMsg = "Not enough ETH for this swap. Add ETH to your wallet for the transaction."
      } else if (raw.includes('Insufficient balance') || raw.includes('Not enough')) {
        userMsg = "Insufficient balance. Add funds to your wallet."
      }

      toast.error(userMsg, { duration: 6000 })
      setSwapStep('error')
      setTimeout(() => setSwapStep('idle'), 3000)
    }
  }, [address, quote, fromToken, toToken, fromAmount, slippage, chainId, sendTransactionAsync])

  const fromTokenMeta = tokens.find(t => t.symbol === fromToken)
  const toTokenMeta   = tokens.find(t => t.symbol === toToken)

  return (
    <div className="max-w-lg mx-auto pt-4 animate-fade-in">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-dark-900 dark:text-white">Swap</h1>
        <p className="text-dark-400 text-sm mt-0.5">
          Trade tokens at best on-chain rates. Your wallet, your keys — always.
        </p>
      </div>

      {/* How it works banner */}
      <div className="bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 rounded-xl px-4 py-3 mb-5 flex items-start gap-3">
        <Shield size={15} className="text-brand-500 shrink-0 mt-0.5"/>
        <div className="text-xs text-brand-700 dark:text-brand-300 leading-relaxed">
          <strong>Non-custodial:</strong> Swaps execute directly on the blockchain from your wallet.
          Coinbidex never holds your funds or private keys.
          You pay only gas + a small spread — we route through 1inch for the best available rate.
        </div>
      </div>

      {/* Wallet not connected */}
      {!isConnected && (
        <div className="card p-8 text-center mb-5">
          <Wallet size={32} className="text-dark-300 dark:text-dark-600 mx-auto mb-3"/>
          <p className="font-semibold text-dark-900 dark:text-white mb-1">Connect your wallet to swap</p>
          <p className="text-sm text-dark-400 mb-4">
            Use MetaMask, Coinbase Wallet, or any web3 wallet. No account needed.
          </p>
          <p className="text-xs text-dark-300 dark:text-dark-500">
            Click "Connect Wallet" in the top bar to get started.
          </p>
        </div>
      )}

      {/* Chain selector */}
      {isConnected && (
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
          {[1, 137, 56, 10, 42161].map(cid => (
            <button
              key={cid}
              onClick={() => switchChain?.({ chainId: cid })}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                chainId === cid
                  ? 'bg-brand-500 text-white'
                  : 'bg-dark-100 dark:bg-dark-800 text-dark-500 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white border border-dark-200 dark:border-dark-700'
              )}
            >
              {CHAIN_NAMES[cid]}
            </button>
          ))}
        </div>
      )}

      {/* Swap card */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-dark-900 dark:text-white">Exchange</span>
            {quote?.isReal && (
              <span className="badge badge-green text-[10px] flex items-center gap-0.5">
                <Zap size={9}/> 1inch live rate
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => refetchQuote()} className="p-1.5 text-dark-400 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-dark-800 rounded-lg transition-colors" title="Refresh quote">
              <RefreshCw size={13}/>
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 text-dark-400 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-dark-800 rounded-lg transition-colors" title="Settings">
              <Settings size={13}/>
            </button>
          </div>
        </div>

        {/* Slippage settings */}
        {showSettings && (
          <div className="px-5 py-3 border-b border-dark-100 dark:border-dark-800 bg-dark-50 dark:bg-dark-800/30">
            <p className="text-xs font-medium text-dark-500 dark:text-dark-300 mb-2">Slippage tolerance</p>
            <div className="flex gap-2">
              {[0.1, 0.5, 1.0, 3.0].map(s => (
                <button key={s} onClick={() => setSlippage(s)}
                  className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-all',
                    slippage === s ? 'bg-brand-500 text-white' : 'bg-dark-200 dark:bg-dark-700 text-dark-500 dark:text-dark-300 hover:text-dark-900 dark:hover:text-white'
                  )}>{s}%</button>
              ))}
              <div className="relative">
                <input
                  className="input text-xs py-1 pl-2 pr-5 w-20"
                  type="number"
                  placeholder="0.5"
                  value={slippage}
                  onChange={e => setSlippage(parseFloat(e.target.value) || 0.5)}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-dark-400">%</span>
              </div>
            </div>
          </div>
        )}

        <div className="p-5 space-y-2">
          {/* From token */}
          <div className="bg-dark-50 dark:bg-dark-800 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-dark-400">From</p>
              {isConnected && nativeBal && fromToken === CHAIN_NATIVE[chainId]?.symbol && (
                <button
                  onClick={() => setFromAmount(formatUnits(nativeBal.value, 18))}
                  className="text-xs text-dark-400 hover:text-brand-500 transition-colors"
                >
                  Balance: {parseFloat(formatUnits(nativeBal.value, 18)).toFixed(4)} <span className="text-brand-500 font-medium">MAX</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Token selector */}
              <div className="relative">
                <button
                  onClick={() => setShowFromList(!showFromList)}
                  className="flex items-center gap-2 bg-white dark:bg-dark-700 border border-dark-200 dark:border-dark-600 rounded-xl px-3 py-2.5 hover:border-brand-300 dark:hover:border-brand-500/50 transition-all min-w-[110px]"
                >
                  <span className="text-base leading-none">{fromTokenMeta?.icon}</span>
                  <span className="font-semibold text-sm text-dark-900 dark:text-white">{fromToken}</span>
                  <ChevronDown size={12} className="text-dark-400 ml-auto"/>
                </button>
                {showFromList && (
                  <div className="absolute top-full mt-1 left-0 z-50 w-52 card shadow-xl max-h-64 overflow-y-auto">
                    {tokens.filter(t => t.symbol !== toToken).map(t => (
                      <button key={t.symbol} onClick={() => { setFromToken(t.symbol); setShowFromList(false) }}
                        className={cn('w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors text-left',
                          fromToken === t.symbol && 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'
                        )}>
                        <span>{t.icon}</span>
                        <div><p className="font-medium text-dark-900 dark:text-white">{t.symbol}</p><p className="text-xs text-dark-400">{t.name}</p></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number"
                placeholder="0.0"
                value={fromAmount}
                onChange={e => setFromAmount(e.target.value)}
                className="flex-1 bg-transparent text-right text-2xl font-mono font-semibold text-dark-900 dark:text-white focus:outline-none placeholder-dark-300 dark:placeholder-dark-600"
              />
            </div>
          </div>

          {/* Flip button */}
          <div className="flex justify-center my-1">
            <button
              onClick={flip}
              className="w-9 h-9 bg-white dark:bg-dark-800 hover:bg-brand-50 dark:hover:bg-dark-700 border border-dark-200 dark:border-dark-700 hover:border-brand-300 dark:hover:border-brand-500/50 rounded-xl flex items-center justify-center text-dark-400 hover:text-brand-500 transition-all duration-300 hover:rotate-180"
            >
              <ArrowUpDown size={15}/>
            </button>
          </div>

          {/* To token */}
          <div className="bg-dark-50 dark:bg-dark-800 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-dark-400">To (estimated)</p>
              <p className="text-xs text-dark-400">On {chainName}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowToList(!showToList)}
                  className="flex items-center gap-2 bg-white dark:bg-dark-700 border border-dark-200 dark:border-dark-600 rounded-xl px-3 py-2.5 hover:border-brand-300 dark:hover:border-brand-500/50 transition-all min-w-[110px]"
                >
                  <span className="text-base leading-none">{toTokenMeta?.icon}</span>
                  <span className="font-semibold text-sm text-dark-900 dark:text-white">{toToken}</span>
                  <ChevronDown size={12} className="text-dark-400 ml-auto"/>
                </button>
                {showToList && (
                  <div className="absolute top-full mt-1 left-0 z-50 w-52 card shadow-xl max-h-64 overflow-y-auto">
                    {tokens.filter(t => t.symbol !== fromToken).map(t => (
                      <button key={t.symbol} onClick={() => { setToToken(t.symbol); setShowToList(false) }}
                        className={cn('w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors text-left',
                          toToken === t.symbol && 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400'
                        )}>
                        <span>{t.icon}</span>
                        <div><p className="font-medium text-dark-900 dark:text-white">{t.symbol}</p><p className="text-xs text-dark-400">{t.name}</p></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 text-right">
                {quoteLoading
                  ? <span className="text-2xl font-mono text-dark-300 dark:text-dark-600 animate-pulse">...</span>
                  : <span className="text-2xl font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      {quote ? fmt.qty(parseFloat(quote.toAmount), 6) : '0.00'}
                    </span>
                }
              </div>
            </div>
          </div>

          {/* Quote details */}
          {quote && !quoteLoading && (
            <div className="bg-dark-50 dark:bg-dark-800/50 border border-dark-100 dark:border-dark-700 rounded-xl p-3.5 space-y-2 animate-slide-up">
              {[
                { label: 'Rate',          value: `1 ${fromToken} = ${fmt.qty(quote.exchangeRate, 6)} ${toToken}` },
                { label: 'Routing via',   value: isDemo ? 'Demo (simulated)' : (quote.route || '1inch'), extra: isDemo ? 'text-yellow-500' : 'text-brand-500 dark:text-brand-400' },
                { label: 'Platform fee',  value: `${quote.markupRate || 0.3}% spread included` },
                { label: 'Min. received', value: `${fmt.qty(parseFloat(quote.toAmount) * (1 - slippage/100), 6)} ${toToken}` },
                { label: 'You pay gas',   value: 'Paid from your wallet in ' + (CHAIN_NATIVE[chainId]?.symbol || 'ETH') },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-xs">
                  <span className="text-dark-400">{row.label}</span>
                  <span className={cn('font-mono text-dark-600 dark:text-dark-300', row.extra)}>{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* High slippage warning */}
          {parseFloat(quote?.priceImpact || '0') > 3 && (
            <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-xl px-3 py-2.5 text-xs text-yellow-700 dark:text-yellow-400">
              <AlertTriangle size={13} className="shrink-0"/>
              High price impact ({quote?.priceImpact}%). Consider splitting into smaller trades.
            </div>
          )}

          {/* Swap button */}
          {!isConnected ? (
            <div className="w-full py-3.5 bg-dark-100 dark:bg-dark-800 text-dark-400 rounded-xl text-sm text-center font-medium">
              Connect wallet to swap
            </div>
          ) : (
            <button
              onClick={executeSwap}
              disabled={!canSwap || swapStep !== 'idle'}
              className={cn(
                'w-full py-3.5 rounded-xl font-semibold text-sm transition-all',
                canSwap && swapStep === 'idle'
                  ? 'bg-brand-500 hover:bg-brand-600 text-white'
                  : 'bg-dark-100 dark:bg-dark-800 text-dark-400 cursor-not-allowed'
              )}
            >
              {swapStep === 'confirming' && (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-dark-300 border-t-brand-500 rounded-full animate-spin"/>
                  Waiting for wallet...
                </span>
              )}
              {swapStep === 'pending' && (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-dark-300 border-t-brand-500 rounded-full animate-spin"/>
                  Confirming on chain...
                </span>
              )}
              {swapStep === 'done' && (
                <span className="flex items-center justify-center gap-2 text-emerald-400">
                  <CheckCircle size={16}/> Swap complete!
                </span>
              )}
              {swapStep === 'error' && (
                <span className="flex items-center justify-center gap-2 text-red-400">
                  <AlertTriangle size={14}/> Failed — tap to retry
                </span>
              )}
              {swapStep === 'idle' && !fromAmount && 'Enter an amount'}
              {swapStep === 'idle' && fromAmount && !quote && quoteLoading && 'Getting best rate...'}
              {swapStep === 'idle' && fromAmount && !quote && !quoteLoading && 'No route found'}
              {swapStep === 'idle' && fromAmount && quote && `Swap ${fromToken} → ${toToken}`}
            </button>
          )}
        </div>
      </div>

      {/* Tx success */}
      {swapStep === 'done' && txHash && (
        <div className="card p-4 mt-4 border-emerald-200 dark:border-emerald-500/30 animate-slide-up">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-500 shrink-0"/>
            <div className="flex-1">
              <p className="font-medium text-dark-900 dark:text-white text-sm">Swap confirmed</p>
              <p className="text-xs text-dark-400 font-mono mt-0.5">{txHash.slice(0,20)}...{txHash.slice(-8)}</p>
            </div>
            <a
              href={`${explorer}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600"
            >
              View <ExternalLink size={11}/>
            </a>
          </div>
        </div>
      )}

      {/* How it works — education builds trust */}
      <div className="mt-6 space-y-3">
        <p className="text-xs font-semibold text-dark-400 dark:text-dark-500 uppercase tracking-widest">How Coinbidex Swap works</p>
        {[
          { icon: Shield,    title: 'Non-custodial',     desc: 'Coinbidex never holds your tokens. Your wallet signs each transaction directly on the blockchain.' },
          { icon: Zap,       title: 'Best rates via 1inch', desc: 'We aggregate quotes from Uniswap, Curve, Balancer and 50+ DEXes to find you the best rate.' },
          { icon: TrendingUp,title: 'How we earn',       desc: 'We include a small spread (0.3%) in the quoted price and receive a referral fee from 1inch — at no extra cost to you.' },
          { icon: Clock,     title: 'Fast & final',      desc: 'Once you approve in your wallet, the swap is irreversible. Always check the estimated output before confirming.' },
        ].map(item => (
          <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-dark-50 dark:bg-dark-900/50 border border-dark-100 dark:border-dark-800">
            <div className="w-7 h-7 bg-brand-100 dark:bg-brand-500/15 rounded-lg flex items-center justify-center shrink-0">
              <item.icon size={13} className="text-brand-500"/>
            </div>
            <div>
              <p className="text-xs font-semibold text-dark-700 dark:text-dark-200">{item.title}</p>
              <p className="text-xs text-dark-400 mt-0.5 leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
