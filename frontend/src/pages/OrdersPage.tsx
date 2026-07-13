import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, X, TrendingUp, TrendingDown } from 'lucide-react'
import api from '@/utils/api'
import { fmt, cn } from '@/utils/format'
import toast from 'react-hot-toast'
import CoinIcon from '@/components/ui/CoinIcon'

type OrderTab = 'open' | 'history' | 'trades'

export default function OrdersPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<OrderTab>('open')

  const { data: openOrders, isLoading: openLoading } = useQuery({
    queryKey: ['orders', 'open'],
    queryFn:  () => api.get('/orders?status=OPEN&limit=50').then(r => r.data.data?.orders ?? []),
    refetchInterval: 10000,
    staleTime: 5000,
  })

  const { data: historyOrders, isLoading: historyLoading } = useQuery({
    queryKey: ['orders', 'history'],
    queryFn:  () => api.get('/orders?status=FILLED,CANCELLED&limit=50').then(r => r.data.data?.orders ?? []),
    enabled:  tab === 'history',
    staleTime: 30000,
  })

  const { data: myTrades, isLoading: tradesLoading } = useQuery({
    queryKey: ['my-trades'],
    queryFn:  () => api.get('/orders/my-trades?limit=50').then(r => r.data.data?.trades ?? []),
    enabled:  tab === 'trades',
    staleTime: 30000,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/orders/${id}`),
    onSuccess: () => {
      toast.success('Order cancelled')
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || 'Cancel failed')
    },
  })

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      OPEN:      'badge-blue',
      FILLED:    'badge-green',
      CANCELLED: 'badge-gray',
      PARTIAL:   'badge-yellow',
    }
    return map[status] ?? 'badge-gray'
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-dark-900 dark:text-white flex items-center gap-2">
        <ClipboardList size={22} className="text-brand-500"/> Orders
      </h1>

      <div className="flex border-b border-dark-100 dark:border-dark-800">
        {([['open','Open Orders'],['history','History'],['trades','My Trades']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? 'tab-active' : 'tab'}>{l}</button>
        ))}
      </div>

      {/* Open orders */}
      {tab === 'open' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dark-50 dark:bg-dark-800/50">
              <tr className="border-b border-dark-100 dark:border-dark-800">
                {['Date','Pair','Type','Side','Price','Amount','Filled','Total','Action'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-dark-400 font-medium uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {openLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-dark-100 dark:border-dark-800">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-dark-100 dark:bg-dark-800 rounded animate-pulse w-16"/>
                      </td>
                    ))}
                  </tr>
                ))
              ) : !openOrders?.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-dark-400">No open orders</td>
                </tr>
              ) : openOrders.map((o: any) => (
                <tr key={o.id} className="border-b border-dark-100 dark:border-dark-800 hover:bg-dark-50 dark:hover:bg-dark-800/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-dark-400">{fmt.datetime(o.createdAt)}</td>
                  <td className="px-4 py-3 font-mono font-medium text-dark-900 dark:text-white"><span className="flex items-center gap-2"><CoinIcon symbol={o.symbol} size={18}/>{o.symbol}</span></td>
                  <td className="px-4 py-3 text-xs text-dark-500 dark:text-dark-400 capitalize">{String(o.type).toLowerCase()}</td>
                  <td className="px-4 py-3">
                    <span className={cn('font-semibold text-xs', o.side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {o.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-dark-900 dark:text-white">{fmt.price(o.price)}</td>
                  <td className="px-4 py-3 font-mono text-dark-600 dark:text-dark-300">{fmt.qty(o.quantity, 6)}</td>
                  <td className="px-4 py-3 font-mono text-dark-400">{fmt.qty(o.filledQuantity, 6)}</td>
                  <td className="px-4 py-3 font-mono text-dark-900 dark:text-white">
                    {fmt.qty((o.price ?? 0) * (o.quantity ?? 0), 2)} USDT
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => cancelMutation.mutate(o.id)}
                      disabled={cancelMutation.isPending}
                      className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors"
                      title="Cancel order"
                    >
                      <X size={13}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Order history */}
      {tab === 'history' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dark-50 dark:bg-dark-800/50">
              <tr className="border-b border-dark-100 dark:border-dark-800">
                {['Date','Pair','Type','Side','Price','Amount','Status'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-dark-400 font-medium uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-dark-400">Loading...</td></tr>
              ) : !historyOrders?.length ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-dark-400">No order history</td></tr>
              ) : historyOrders.map((o: any) => (
                <tr key={o.id} className="border-b border-dark-100 dark:border-dark-800 hover:bg-dark-50 dark:hover:bg-dark-800/30">
                  <td className="px-4 py-3 text-xs text-dark-400">{fmt.datetime(o.createdAt)}</td>
                  <td className="px-4 py-3 font-mono font-medium text-dark-900 dark:text-white"><span className="flex items-center gap-2"><CoinIcon symbol={o.symbol} size={18}/>{o.symbol}</span></td>
                  <td className="px-4 py-3 text-xs text-dark-500 capitalize">{String(o.type).toLowerCase()}</td>
                  <td className="px-4 py-3">
                    <span className={cn('font-semibold text-xs', o.side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {o.side === 'BUY' ? <TrendingUp size={12} className="inline mr-1"/> : <TrendingDown size={12} className="inline mr-1"/>}
                      {o.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-dark-900 dark:text-white">{fmt.price(o.price)}</td>
                  <td className="px-4 py-3 font-mono text-dark-600 dark:text-dark-300">{fmt.qty(o.quantity, 6)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${statusBadge(o.status)}`}>{o.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Trades */}
      {tab === 'trades' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dark-50 dark:bg-dark-800/50">
              <tr className="border-b border-dark-100 dark:border-dark-800">
                {['Date','Pair','Side','Price','Qty','Fee','Total'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-dark-400 font-medium uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tradesLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-dark-400">Loading...</td></tr>
              ) : !myTrades?.length ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-dark-400">No trades yet</td></tr>
              ) : myTrades.map((t: any) => (
                <tr key={t.id} className="border-b border-dark-100 dark:border-dark-800 hover:bg-dark-50 dark:hover:bg-dark-800/30">
                  <td className="px-4 py-3 text-xs text-dark-400">{fmt.datetime(t.createdAt)}</td>
                  <td className="px-4 py-3 font-mono font-medium text-dark-900 dark:text-white"><span className="flex items-center gap-2"><CoinIcon symbol={t.symbol} size={18}/>{t.symbol}</span></td>
                  <td className="px-4 py-3">
                    <span className={cn('font-semibold text-xs', t.side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {t.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-dark-900 dark:text-white">{fmt.price(t.price)}</td>
                  <td className="px-4 py-3 font-mono text-dark-600 dark:text-dark-300">{fmt.qty(t.quantity, 6)}</td>
                  <td className="px-4 py-3 font-mono text-dark-400">{fmt.qty(t.fee, 6)} {t.feeAsset}</td>
                  <td className="px-4 py-3 font-mono text-dark-900 dark:text-white">
                    {fmt.qty((t.price ?? 0) * (t.quantity ?? 0), 2)} USDT
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
