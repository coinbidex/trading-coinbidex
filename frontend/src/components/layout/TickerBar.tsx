import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllTickersSocket } from '@/utils/socket'
import { fmt, colorClass } from '@/utils/format'

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

  const items: TickerItem[] = SYMBOLS.map(s =>
    tickers[s] ?? { symbol: s, lastPrice: 0, priceChangePct: 0 }
  )

  return (
    <div className="h-8 bg-dark-50 dark:bg-dark-900/70 border-b border-dark-100 dark:border-dark-800 overflow-hidden flex items-center shrink-0">
      <div className="flex animate-ticker-scroll whitespace-nowrap">
        {[...items, ...items].map((t, i) => (
          <button
            key={`${t.symbol}-${i}`}
            onClick={() => navigate(`/trade/${t.symbol}`)}
            className="inline-flex items-center gap-2 px-4 text-xs hover:bg-dark-100 dark:hover:bg-dark-800 h-8 transition-colors shrink-0"
          >
            <span className="text-dark-600 dark:text-dark-300 font-medium">
              {t.symbol.replace('USDT', '')}
            </span>
            <span className="font-mono text-dark-900 dark:text-white">
              ${t.lastPrice > 0 ? fmt.price(t.lastPrice) : '—'}
            </span>
            <span className={`font-mono text-xs ${colorClass(t.priceChangePct)}`}>
              {fmt.pct(t.priceChangePct)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
