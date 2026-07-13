import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllTickersSocket } from '@/utils/socket'
import { fmt, colorClass } from '@/utils/format'
import { useLivePrices } from '@/hooks/useLivePrices'
import CoinIcon from '@/components/ui/CoinIcon'
import { baseSymbol } from '@/utils/coins'

const SYMBOLS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','DOTUSDT','LINKUSDT','MATICUSDT',
  'AVAXUSDT','UNIUSDT','LTCUSDT','ATOMUSDT','TRXUSDT',
]

interface TickerItem {
  symbol:         string
  lastPrice:      number
  priceChangePct: number
}

export default function TickerBar() {
  const navigate = useNavigate()
  const [tickers, setTickers] = useState<Record<string, TickerItem>>({})
  const { get: getLive } = useLivePrices()

  // useAllTickersSocket uses stable callback ref — no re-subscription
  useAllTickersSocket((data: any) => {
    if (!data?.symbol) return
    setTickers(prev => ({
      ...prev,
      [data.symbol]: {
        symbol:         data.symbol,
        lastPrice:      data.lastPrice      ?? 0,
        priceChangePct: data.priceChangePct ?? 0,
      }
    }))
  })

  const items: TickerItem[] = SYMBOLS.map(s => {
    const platform = tickers[s]
    const live = getLive(s)
    // Prefer the platform feed, but never show a blank/zero row when we have
    // a real live price available from the fallback feed.
    const lastPrice = platform?.lastPrice && platform.lastPrice > 0 ? platform.lastPrice : (live?.price ?? 0)
    const priceChangePct = platform?.priceChangePct ?? live?.changePct ?? 0
    return { symbol: s, lastPrice, priceChangePct }
  })

  return (
    <div className="h-9 bg-white dark:bg-dark-900/70 border-b border-dark-100 dark:border-dark-800 overflow-hidden flex items-center shrink-0">
      <div className="flex animate-ticker-scroll whitespace-nowrap">
        {[...items, ...items].map((t, i) => (
          <button
            key={`${t.symbol}-${i}`}
            onClick={() => navigate(`/trade/${t.symbol}`)}
            className="inline-flex items-center gap-2 px-4 text-xs hover:bg-dark-50 dark:hover:bg-dark-800 h-9 transition-colors shrink-0"
          >
            <CoinIcon symbol={t.symbol} size={16} />
            <span className="text-dark-600 dark:text-dark-300 font-semibold">
              {baseSymbol(t.symbol)}
            </span>
            <span className="font-mono text-dark-900 dark:text-white">
              ${t.lastPrice > 0 ? fmt.price(t.lastPrice) : '—'}
            </span>
            <span className={`font-mono text-xs font-medium ${colorClass(t.priceChangePct)}`}>
              {fmt.pct(t.priceChangePct)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
