import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createChart, ColorType, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react'
import api from '@/utils/api'
import { useMarketSocket } from '@/utils/socket'
import { fmt, colorClass, cn } from '@/utils/format'
import toast from 'react-hot-toast'
import CoinIcon from '@/components/ui/CoinIcon'
import { useLivePrices } from '@/hooks/useLivePrices'

// ── Types ─────────────────────────────────────────────────────
interface Ticker {
  symbol:         string
  lastPrice:      number
  priceChangePct: number
  priceChange:    number
  high24h:        number
  low24h:         number
  volume24h:      number
  quoteVolume24h: number
}

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
interface OrderBookEntry { price: number; quantity: number; total: number }
interface OrderBook { bids: OrderBookEntry[]; asks: OrderBookEntry[] }

type OrderSide  = 'BUY' | 'SELL'
type OrderType  = 'limit' | 'market' | 'stop'
type ChartTab   = 'orderbook' | 'trades'

const SYMBOLS  = ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','DOTUSDT','LINKUSDT','MATICUSDT','AVAXUSDT','UNIUSDT']
const INTERVALS = ['1m','5m','15m','1h','4h','1d']

// ── Chart colors ──────────────────────────────────────────────
const CHART_OPTS = {
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor:  '#94a3b8',
  },
  grid: {
    vertLines:   { color: '#1e293b' },
    horzLines:   { color: '#1e293b' },
  },
  crosshair: {
    vertLine:    { color: '#334155', labelBackgroundColor: '#1a56ff' },
    horzLine:    { color: '#334155', labelBackgroundColor: '#1a56ff' },
  },
  rightPriceScale: { borderColor: '#1e293b' },
  timeScale:       { borderColor: '#1e293b', timeVisible: true },
}

// ── Helpers ───────────────────────────────────────────────────
function buildOrderBook(raw: any): OrderBook {
  if (!raw) return { bids: [], asks: [] }
  const process = (arr: any[], desc: boolean): OrderBookEntry[] => {
    const items = Array.isArray(arr) ? arr : []
    let running = 0
    const result = items.slice(0, 15).map((e: any) => {
      const price = parseFloat(e.price || e[0] || 0)
      const qty   = parseFloat(e.quantity || e[1] || 0)
      running += price * qty
      return { price, quantity: qty, total: running }
    })
    return desc ? result.sort((a, b) => b.price - a.price) : result
  }
  return {
    bids: process(raw.bids, true),
    asks: process(raw.asks, false).reverse(),
  }
}

// ── Main Component ────────────────────────────────────────────
export default function TradingPage() {
  const { symbol: paramSymbol } = useParams<{ symbol?: string }>()
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const chartRef   = useRef<HTMLDivElement>(null)
  const chartApi   = useRef<IChartApi | null>(null)
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null)

  const [symbol,     setSymbol]     = useState(paramSymbol?.toUpperCase() || 'BTCUSDT')
  const [interval,   setInterval]   = useState('1h')
  const [chartTab,   setChartTab]   = useState<ChartTab>('orderbook')
  const [orderType,  setOrderType]  = useState<OrderType>('limit')
  const [side,       setSide]       = useState<OrderSide>('BUY')
  const [price,      setPrice]      = useState('')
  const [quantity,   setQuantity]   = useState('')
  const [stopPrice,  setStopPrice]  = useState('')
  const [ticker,     setTicker]     = useState<Ticker | null>(null)
  const [showSymbols,setShowSymbols]= useState(false)

  // Sync URL param
  useEffect(() => {
    if (paramSymbol) setSymbol(paramSymbol.toUpperCase())
  }, [paramSymbol])

  // Change symbol
  const handleSymbolChange = useCallback((sym: string) => {
    setSymbol(sym)
    setShowSymbols(false)
    setTicker(null)
    navigate(`/trade/${sym}`, { replace: true })
  }, [navigate])

  // Live ticker via WebSocket — stable callback via useMarketSocket
  useMarketSocket(symbol, useCallback((data: Ticker) => {
    setTicker(data)
    if (candleSeries.current && data.lastPrice) {
      candleSeries.current.update({
        time:  Math.floor(Date.now() / 1000) as any,
        open:  data.lastPrice,
        high:  data.lastPrice,
        low:   data.lastPrice,
        close: data.lastPrice,
      })
    }
  }, []))

  // Fetch initial ticker
  const { data: initialTicker } = useQuery<Ticker>({
    queryKey: ['ticker', symbol],
    queryFn:  () => api.get(`/markets/${symbol}/ticker`).then(r => r.data.data),
    staleTime: 30000,
    retry: 2,
  })

  // Set ticker from initial fetch only if WS hasn't provided one
  useEffect(() => {
    if (initialTicker && !ticker) setTicker(initialTicker)
  }, [initialTicker]) // intentionally not including ticker

  const liveTicker = ticker || initialTicker || null

  // Candle data
  const { data: candleData } = useQuery<Candle[]>({
    queryKey: ['candles', symbol, interval],
    queryFn:  () => api.get(`/markets/${symbol}/candles?interval=${interval}&limit=300`)
                      .then(r => r.data.data?.candles || r.data.data || []),
    staleTime: 60000,
    retry: 2,
  })

  // Order book — poll every 3s
  const { data: rawOrderBook } = useQuery({
    queryKey:       ['orderbook', symbol],
    queryFn:        () => api.get(`/orders/orderbook/${symbol}`).then(r => r.data.data),
    refetchInterval: 3000,
    staleTime:       2000,
    retry:           1,
  })

  // Recent trades
  const { data: tradeHistory } = useQuery({
    queryKey:       ['trades', symbol],
    queryFn:        () => api.get(`/orders/trades/${symbol}?limit=30`).then(r => r.data.data),
    refetchInterval: 5000,
    staleTime:       4000,
    retry:           1,
  })

  // User wallets
  const { data: wallets } = useQuery({
    queryKey:  ['wallets'],
    queryFn:   () => api.get('/wallets').then(r => r.data.data),
    staleTime:  30000,
  })

  const base         = symbol.replace('USDT', '')
  const baseWallet   = Array.isArray(wallets) ? wallets.find((w: any) => w.asset?.symbol === base)       : null
  const quoteWallet  = Array.isArray(wallets) ? wallets.find((w: any) => w.asset?.symbol === 'USDT')     : null
  const baseBalance  = parseFloat(baseWallet?.balance  || '0')
  const quoteBalance = parseFloat(quoteWallet?.balance || '0')

  const orderBook = buildOrderBook(rawOrderBook)

  // ── Chart setup ──────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return

    const chart = createChart(chartRef.current, {
      ...CHART_OPTS,
      width:  chartRef.current.clientWidth,
      height: 340,
    })

    const series = chart.addCandlestickSeries({
      upColor:        '#10b981',
      downColor:      '#ef4444',
      borderUpColor:  '#10b981',
      borderDownColor:'#ef4444',
      wickUpColor:    '#10b981',
      wickDownColor:  '#ef4444',
    })

    chartApi.current    = chart
    candleSeries.current = series

    const ro = new ResizeObserver(() => {
      if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth })
    })
    ro.observe(chartRef.current)

    return () => {
      ro.disconnect()
      chart.remove()
      chartApi.current     = null
      candleSeries.current = null
    }
  }, []) // mount once

  // Load candle data into chart
  useEffect(() => {
    if (!candleSeries.current || !Array.isArray(candleData) || candleData.length === 0) return
    try {
      const valid = candleData
        .filter(c => c && c.time && c.open && c.high && c.low && c.close)
        .sort((a, b) => a.time - b.time)
      candleSeries.current.setData(valid as any)
      chartApi.current?.timeScale().fitContent()
    } catch (err) {
      console.error('Chart data error:', err)
    }
  }, [candleData])

  // ── Place order ──────────────────────────────────────────────
  const orderMutation = useMutation({
    mutationFn: (data: any) => api.post('/orders', data),
    onSuccess: () => {
      toast.success(`${side} order placed!`)
      setQuantity('')
      setPrice('')
      setStopPrice('')
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Order failed')
    },
  })

  const placeOrder = () => {
    if (!quantity || parseFloat(quantity) <= 0) {
      toast.error('Enter a valid quantity')
      return
    }
    if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) {
      toast.error('Enter a valid price for limit order')
      return
    }
    orderMutation.mutate({
      symbol, side,
      type:      orderType.toUpperCase(),
      quantity:  parseFloat(quantity),
      price:     orderType !== 'market'  ? parseFloat(price)     : undefined,
      stopPrice: orderType === 'stop'    ? parseFloat(stopPrice)  : undefined,
    })
  }

  const pctChange  = liveTicker?.priceChangePct ?? 0
  const isPositive = pctChange >= 0
  const { get: getLive } = useLivePrices()
  const fallbackLive = getLive(symbol)
  const displayPrice = liveTicker?.lastPrice && liveTicker.lastPrice > 0 ? liveTicker.lastPrice : (fallbackLive?.price ?? 0)

  return (
    <div className="flex flex-col gap-4 animate-fade-in min-h-0">
      {/* Top bar — symbol selector + ticker summary */}
      <div className="card p-3 flex flex-wrap items-center gap-4">
        {/* Symbol picker */}
        <div className="relative">
          <button
            onClick={() => setShowSymbols(!showSymbols)}
            className="flex items-center gap-2 font-display font-bold text-lg text-dark-900 dark:text-white hover:text-brand-500 transition-colors"
          >
            <CoinIcon symbol={symbol} size={24} />
            {symbol.replace('USDT','')}<span className="text-dark-400 font-normal text-sm">/USDT</span>
            <ChevronDown size={16} className={cn('text-dark-400 transition-transform', showSymbols && 'rotate-180')}/>
          </button>
          {showSymbols && (
            <div className="absolute top-full left-0 mt-1 w-52 card shadow-xl z-50 overflow-hidden">
              {SYMBOLS.map(s => (
                <button key={s} onClick={() => handleSymbolChange(s)}
                  className={cn(
                    'w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-sm font-medium hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors',
                    s === symbol ? 'text-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'text-dark-700 dark:text-dark-200'
                  )}>
                  <CoinIcon symbol={s} size={18} />
                  {s.replace('USDT','')} <span className="text-dark-400">/USDT</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {liveTicker && (
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <span className={`text-2xl font-mono font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                ${fmt.price(displayPrice)}
              </span>
            </div>
            {[
              { label: '24h Change', value: fmt.pct(pctChange), cls: colorClass(pctChange) },
              { label: '24h High',   value: `$${fmt.price(liveTicker.high24h)}` },
              { label: '24h Low',    value: `$${fmt.price(liveTicker.low24h)}` },
              { label: '24h Volume', value: fmt.volume((liveTicker.lastPrice || 0) * (liveTicker.volume24h || 0)) },
            ].map(({ label, value, cls }) => (
              <div key={label} className="hidden md:block">
                <p className="text-xs text-dark-400">{label}</p>
                <p className={cn('text-sm font-mono font-medium', cls || 'text-dark-900 dark:text-white')}>{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Chart + order book/trades — takes 3 cols */}
        <div className="xl:col-span-3 space-y-4">
          {/* Chart */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-1 px-4 py-2 border-b border-dark-100 dark:border-dark-800">
              {INTERVALS.map(i => (
                <button key={i} onClick={() => setInterval(i)}
                  className={cn('px-2.5 py-1 text-xs rounded font-medium transition-all',
                    interval === i ? 'bg-brand-500 text-white' : 'text-dark-400 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-dark-800'
                  )}>
                  {i}
                </button>
              ))}
            </div>
            <div ref={chartRef} className="w-full h-[340px]"/>
          </div>

          {/* Order book / trades */}
          <div className="card overflow-hidden">
            <div className="flex border-b border-dark-100 dark:border-dark-800">
              {(['orderbook','trades'] as ChartTab[]).map(t => (
                <button key={t} onClick={() => setChartTab(t)}
                  className={chartTab === t ? 'tab-active' : 'tab'}>
                  {t === 'orderbook' ? 'Order Book' : 'Recent Trades'}
                </button>
              ))}
            </div>

            {chartTab === 'orderbook' ? (
              <div className="grid grid-cols-2 gap-0 divide-x divide-dark-100 dark:divide-dark-800">
                {/* Asks (sells) */}
                <div>
                  <div className="grid grid-cols-3 px-3 py-1.5 text-xs text-dark-400 font-medium border-b border-dark-100 dark:border-dark-800">
                    <span>Price</span><span className="text-right">Amount</span><span className="text-right">Total</span>
                  </div>
                  {orderBook.asks.map((ask, i) => (
                    <button key={i} onClick={() => setPrice(ask.price.toString())}
                      className="w-full grid grid-cols-3 px-3 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-500/5 transition-colors relative">
                      <div className="absolute inset-y-0 right-0 bg-red-500/8"
                        style={{ width: `${Math.min(100, (ask.total / (orderBook.asks[0]?.total || 1)) * 100)}%` }}/>
                      <span className="text-red-500 dark:text-red-400 font-mono relative">{fmt.price(ask.price)}</span>
                      <span className="text-right font-mono text-dark-600 dark:text-dark-300 relative">{fmt.qty(ask.quantity, 4)}</span>
                      <span className="text-right font-mono text-dark-400 relative">{fmt.qty(ask.total, 2)}</span>
                    </button>
                  ))}
                </div>
                {/* Bids (buys) */}
                <div>
                  <div className="grid grid-cols-3 px-3 py-1.5 text-xs text-dark-400 font-medium border-b border-dark-100 dark:border-dark-800">
                    <span>Price</span><span className="text-right">Amount</span><span className="text-right">Total</span>
                  </div>
                  {orderBook.bids.map((bid, i) => (
                    <button key={i} onClick={() => setPrice(bid.price.toString())}
                      className="w-full grid grid-cols-3 px-3 py-1 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-500/5 transition-colors relative">
                      <div className="absolute inset-y-0 right-0 bg-emerald-500/8"
                        style={{ width: `${Math.min(100, (bid.total / (orderBook.bids[0]?.total || 1)) * 100)}%` }}/>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono relative">{fmt.price(bid.price)}</span>
                      <span className="text-right font-mono text-dark-600 dark:text-dark-300 relative">{fmt.qty(bid.quantity, 4)}</span>
                      <span className="text-right font-mono text-dark-400 relative">{fmt.qty(bid.total, 2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-3 px-4 py-2 text-xs text-dark-400 font-medium border-b border-dark-100 dark:border-dark-800">
                  <span>Price</span><span className="text-right">Amount</span><span className="text-right">Time</span>
                </div>
                {(Array.isArray(tradeHistory) ? tradeHistory : []).slice(0, 30).map((t: any, i: number) => (
                  <div key={i} className="grid grid-cols-3 px-4 py-1 text-xs">
                    <span className={cn('font-mono', t.side === 'BUY' ? 'text-emerald-500' : 'text-red-500')}>
                      {fmt.price(t.price)}
                    </span>
                    <span className="text-right font-mono text-dark-600 dark:text-dark-300">{fmt.qty(t.quantity, 4)}</span>
                    <span className="text-right text-dark-400">{fmt.timeAgo(t.createdAt)}</span>
                  </div>
                ))}
                {(!tradeHistory || tradeHistory.length === 0) && (
                  <p className="text-center py-6 text-dark-400 text-sm">No trades yet</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Order form — 1 col */}
        <div className="card overflow-hidden">
          {/* Buy / Sell tabs */}
          <div className="grid grid-cols-2">
            <button onClick={() => setSide('BUY')}
              className={cn('py-3 text-sm font-bold transition-all',
                side === 'BUY' ? 'bg-emerald-500 text-white' : 'text-dark-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
              )}>Buy</button>
            <button onClick={() => setSide('SELL')}
              className={cn('py-3 text-sm font-bold transition-all',
                side === 'SELL' ? 'bg-red-500 text-white' : 'text-dark-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
              )}>Sell</button>
          </div>

          <div className="p-4 space-y-4">
            {/* Order type */}
            <div className="flex gap-1">
              {(['limit','market','stop'] as OrderType[]).map(t => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={cn('flex-1 py-1.5 text-xs rounded font-medium transition-all capitalize',
                    orderType === t ? 'bg-dark-200 dark:bg-dark-700 text-dark-900 dark:text-white' : 'text-dark-400 hover:text-dark-900 dark:hover:text-white'
                  )}>{t}</button>
              ))}
            </div>

            {/* Balances */}
            <div className="flex justify-between text-xs text-dark-400 bg-dark-50 dark:bg-dark-800 rounded-lg px-3 py-2">
              <span>Available</span>
              <span className="font-mono text-dark-700 dark:text-dark-200">
                {side === 'BUY'
                  ? `${fmt.qty(quoteBalance, 2)} USDT`
                  : `${fmt.qty(baseBalance, 6)} ${base}`
                }
              </span>
            </div>

            {/* Price input (limit + stop) */}
            {orderType !== 'market' && (
              <div>
                <label className="text-xs text-dark-400 mb-1 block">Price (USDT)</label>
                <div className="relative">
                  <input
                    className="input font-mono text-right pr-14"
                    type="number"
                    placeholder="0.00"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    min="0"
                    step="any"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dark-400">USDT</span>
                </div>
              </div>
            )}

            {/* Stop price */}
            {orderType === 'stop' && (
              <div>
                <label className="text-xs text-dark-400 mb-1 block">Stop Price (USDT)</label>
                <div className="relative">
                  <input
                    className="input font-mono text-right pr-14"
                    type="number"
                    placeholder="0.00"
                    value={stopPrice}
                    onChange={e => setStopPrice(e.target.value)}
                    min="0"
                    step="any"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dark-400">USDT</span>
                </div>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Amount ({base})</label>
              <div className="relative">
                <input
                  className="input font-mono text-right pr-14"
                  type="number"
                  placeholder="0.000000"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  min="0"
                  step="any"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-dark-400">{base}</span>
              </div>
            </div>

            {/* Quick pct buttons */}
            <div className="grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map(pct => (
                <button key={pct} onClick={() => {
                  if (side === 'BUY' && price && parseFloat(price) > 0) {
                    setQuantity(((quoteBalance * pct / 100) / parseFloat(price)).toFixed(6))
                  } else if (side === 'SELL') {
                    setQuantity((baseBalance * pct / 100).toFixed(6))
                  }
                }} className="py-1 text-xs rounded bg-dark-100 dark:bg-dark-700 text-dark-500 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white transition-colors">
                  {pct}%
                </button>
              ))}
            </div>

            {/* Total */}
            {quantity && price && (
              <div className="flex justify-between text-xs text-dark-400 bg-dark-50 dark:bg-dark-800 rounded px-3 py-2">
                <span>Total</span>
                <span className="font-mono">{fmt.qty(parseFloat(quantity || '0') * parseFloat(price || '0'), 2)} USDT</span>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={placeOrder}
              disabled={orderMutation.isPending}
              className={cn(
                'w-full py-3 rounded-xl font-bold text-sm text-white transition-all',
                side === 'BUY'
                  ? 'bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50'
                  : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/50',
                'disabled:cursor-not-allowed'
              )}
            >
              {orderMutation.isPending
                ? 'Placing...'
                : `${side} ${base}`
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
