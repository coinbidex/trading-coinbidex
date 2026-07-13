import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, TrendingUp, TrendingDown, BarChart2, Star } from 'lucide-react'
import api from '@/utils/api'
import { fmt, colorClass } from '@/utils/format'
import { useAllTickersSocket } from '@/utils/socket'
import { useLivePrices } from '@/hooks/useLivePrices'
import CoinIcon from '@/components/ui/CoinIcon'
import { coinMeta } from '@/utils/coins'

export default function MarketsPage() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('volume24h')
  const [sortOrder, setSortOrder] = useState<'asc'|'desc'>('desc')
  const [liveTickers, setLiveTickers] = useState<Record<string, any>>({})
  const [tab, setTab] = useState<'all' | 'gainers' | 'losers'>('all')
  const { get: getLive } = useLivePrices()

  useAllTickersSocket((data) => setLiveTickers(prev => ({ ...prev, [data.symbol]: data })))

  const { data, isLoading } = useQuery({
    queryKey: ['markets', search],
    queryFn: () => api.get(`/markets?search=${search}&sortBy=${sortBy}&order=${sortOrder}&limit=50`).then(r => r.data.data),
    refetchInterval: 30000,
  })

  let markets = data?.markets || []

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortOrder('desc') }
  }

  const SortBtn = ({ col, label }: { col: string; label: string }) => (
    <button onClick={() => handleSort(col)} className="flex items-center gap-1 text-xs text-dark-400 font-semibold uppercase tracking-wide hover:text-dark-900 dark:hover:text-white transition-colors">
      {label}
      {sortBy === col && <span className="text-brand-500">{sortOrder === 'desc' ? '↓' : '↑'}</span>}
    </button>
  )

  const rows = markets.map((m: any) => {
    const live = liveTickers[m.symbol]
    const fallback = getLive(m.symbol)
    const price = (live?.lastPrice ?? m.lastPrice) || fallback?.price || 0
    const pct   = live?.priceChangePct ?? m.priceChangePct ?? fallback?.changePct ?? 0
    const high  = (live?.high24h ?? m.high24h) || fallback?.high24h || 0
    const low   = (live?.low24h ?? m.low24h) || fallback?.low24h || 0
    const vol   = (live?.volume24h ?? m.volume24h) || (fallback?.volume24h ? fallback.volume24h / (price || 1) : 0)
    return { m, price: parseFloat(String(price)), pct: parseFloat(String(pct)), high: parseFloat(String(high)), low: parseFloat(String(low)), vol: parseFloat(String(vol)) }
  })

  const filtered = tab === 'gainers' ? rows.filter((r: any) => r.pct > 0).sort((a: any,b: any)=>b.pct-a.pct)
    : tab === 'losers' ? rows.filter((r: any) => r.pct < 0).sort((a: any,b: any)=>a.pct-b.pct)
    : rows

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white flex items-center gap-2">
            <span className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
              <BarChart2 size={18} className="text-brand-500" />
            </span>
            Markets
          </h1>
          <p className="text-dark-400 text-sm mt-1">{data?.pagination?.total || markets.length || 0} trading pairs · live pricing</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            className="input pl-9 w-full sm:w-64"
            placeholder="Search pair..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-dark-100 dark:border-dark-800">
        {(['all','gainers','losers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'tab-active' : 'tab'}>
            {t === 'all' ? 'All Markets' : t === 'gainers' ? 'Top Gainers' : 'Top Losers'}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-100 dark:border-dark-800 table-header">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide w-8">#</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide">
                  <button className="flex items-center gap-1"><Star size={12}/> Pair</button>
                </th>
                <th className="text-right px-5 py-3"><SortBtn col="lastPrice" label="Price" /></th>
                <th className="text-right px-5 py-3"><SortBtn col="priceChangePct" label="24h %" /></th>
                <th className="text-right px-5 py-3 hidden md:table-cell"><SortBtn col="high24h" label="24h High" /></th>
                <th className="text-right px-5 py-3 hidden md:table-cell"><SortBtn col="low24h" label="24h Low" /></th>
                <th className="text-right px-5 py-3 hidden lg:table-cell"><SortBtn col="volume24h" label="Volume" /></th>
                <th className="text-right px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-dark-100 dark:border-dark-800/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5"><div className="h-4 bg-dark-100 dark:bg-dark-800 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-16 text-center text-dark-400 text-sm">No markets match your filters.</td></tr>
              ) : filtered.map(({ m, price, pct, high, low, vol }: any, i: number) => {
                const meta = coinMeta(m.symbol)
                return (
                  <tr key={m.id} className="border-b border-dark-100 dark:border-dark-800/60 table-row-hover">
                    <td className="px-5 py-3.5 text-dark-400 text-xs">{i + 1}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <CoinIcon symbol={m.symbol} size={30} src={m.baseAsset?.logoUrl} />
                        <div>
                          <p className="font-semibold text-dark-900 dark:text-white text-sm">{meta.symbol}<span className="text-dark-400">/USDT</span></p>
                          <p className="text-xs text-dark-400">{m.baseAsset?.name || meta.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-semibold text-dark-900 dark:text-white">${fmt.price(price)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`badge ${pct >= 0 ? 'badge-green' : 'badge-red'}`}>
                        {pct >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                        {fmt.pct(pct)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right hidden md:table-cell font-mono text-emerald-600 dark:text-emerald-400 text-sm">${fmt.price(high)}</td>
                    <td className="px-5 py-3.5 text-right hidden md:table-cell font-mono text-red-600 dark:text-red-400 text-sm">${fmt.price(low)}</td>
                    <td className="px-5 py-3.5 text-right hidden lg:table-cell font-mono text-dark-500 dark:text-dark-300 text-sm">{fmt.volume(price * vol)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <Link to={`/trade/${m.symbol}`} className="btn-primary btn-sm">Trade</Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
