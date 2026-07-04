import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, Star, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react'
import api from '@/utils/api'
import { fmt, colorClass } from '@/utils/format'
import { useAllTickersSocket } from '@/utils/socket'

export default function MarketsPage() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('volume24h')
  const [sortOrder, setSortOrder] = useState<'asc'|'desc'>('desc')
  const [liveTickers, setLiveTickers] = useState<Record<string, any>>({})

  useAllTickersSocket((data) => setLiveTickers(prev => ({ ...prev, [data.symbol]: data })))

  const { data, isLoading } = useQuery({
    queryKey: ['markets', search],
    queryFn: () => api.get(`/markets?search=${search}&sortBy=${sortBy}&order=${sortOrder}&limit=50`).then(r => r.data.data),
    refetchInterval: 30000,
  })

  const markets = data?.markets || []

  const handleSort = (col: string) => {
    if (sortBy === col) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortOrder('desc') }
  }

  const SortBtn = ({ col, label }: { col: string; label: string }) => (
    <button onClick={() => handleSort(col)} className="flex items-center gap-1 text-xs text-dark-400 font-medium hover:text-white transition-colors">
      {label}
      {sortBy === col && <span className="text-brand-400">{sortOrder === 'desc' ? '↓' : '↑'}</span>}
    </button>
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 size={22} className="text-brand-400" /> Markets
          </h1>
          <p className="text-dark-400 text-sm mt-0.5">{data?.pagination?.total || 0} trading pairs</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
          <input
            className="input pl-9 w-56"
            placeholder="Search pair..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="">
              <tr className="border-b ">
                <th className="text-left px-5 py-3 text-xs text-dark-400 font-medium w-8">#</th>
                <th className="text-left px-5 py-3 text-xs text-dark-400 font-medium">Pair</th>
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
                  <tr key={i} className="border-b border-dark-800/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-5 py-3.5"><div className="h-4 bg-dark-800 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : markets.map((m: any, i: number) => {
                const live = liveTickers[m.symbol]
                const price  = live?.lastPrice  ?? m.lastPrice  ?? 0
                const pct    = live?.priceChangePct ?? m.priceChangePct ?? 0
                const high   = live?.high24h   ?? m.high24h   ?? 0
                const low    = live?.low24h    ?? m.low24h    ?? 0
                const vol    = live?.volume24h ?? m.volume24h ?? 0
                return (
                  <tr key={m.id} className="border-b table-row-hover">
                    <td className="px-5 py-3.5 text-dark-500 text-xs">{i + 1}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <img src={m.baseAsset?.logoUrl} alt="" className="w-7 h-7 rounded-full bg-dark-700" onError={e => (e.currentTarget.style.display='none')} />
                        <div>
                          <p className="font-semibold text-dark-500 text-sm">{m.baseAsset?.symbol}<span className="text-dark-500">/USDT</span></p>
                          <p className="text-xs text-dark-400">{m.baseAsset?.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono font-medium text-dark-500">${fmt.price(price)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={`badge ${parseFloat(pct) >= 0 ? 'badge-green' : 'badge-red'}`}>
                        {parseFloat(pct) >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                        {fmt.pct(pct)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right hidden md:table-cell font-mono text-emerald-400 text-sm">${fmt.price(high)}</td>
                    <td className="px-5 py-3.5 text-right hidden md:table-cell font-mono text-red-400 text-sm">${fmt.price(low)}</td>
                    <td className="px-5 py-3.5 text-right hidden lg:table-cell font-mono text-dark-300 text-sm">{fmt.volume(parseFloat(price) * parseFloat(vol))}</td>
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
