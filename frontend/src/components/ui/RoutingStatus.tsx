import { useQuery } from '@tanstack/react-query'
import { CheckCircle, XCircle, AlertCircle, ExternalLink, DollarSign, Zap, TrendingUp } from 'lucide-react'
import api from '@/utils/api'

export default function RoutingStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-routing'],
    queryFn: () => api.get('/admin/routing').then(r => r.data.data),
    refetchInterval: 30000,
  })

  const { data: revenue } = useQuery({
    queryKey: ['admin-revenue'],
    queryFn: () => api.get('/admin/revenue').then(r => r.data.data),
    refetchInterval: 30000,
  })

  if (isLoading) return <div className="card p-6 animate-pulse"><div className="h-32 bg-dark-800 rounded-lg"/></div>

  const status = data?.status
  const today  = data?.today

  return (
    <div className="space-y-4">

      {/* Revenue summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Today',      value: `$${(revenue?.revenue?.today  || 0).toFixed(2)}`,  icon: DollarSign, color: 'text-emerald-400' },
          { label: 'This month', value: `$${(revenue?.revenue?.month  || 0).toFixed(2)}`,  icon: TrendingUp,  color: 'text-brand-400' },
          { label: 'All time',   value: `$${(revenue?.revenue?.total  || 0).toFixed(2)}`,  icon: Zap,         color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-1">
              <span className="stat-label">{s.label}</span>
              <s.icon size={14} className={s.color}/>
            </div>
            <span className={`stat-value ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Route status cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        {status && [
          {
            key: 'swap',
            label: 'Swap routing',
            data: status.swap,
            setupUrl: 'https://portal.1inch.dev',
            setupLabel: 'Get 1inch API key (free)',
          },
          {
            key: 'trade',
            label: 'Trade routing',
            data: status.trade,
            setupUrl: 'https://www.binance.com/en/broker',
            setupLabel: 'Apply for Binance Broker',
          },
          {
            key: 'deposit',
            label: 'Deposit routing',
            data: status.deposit,
            setupUrl: 'https://www.moonpay.com/business/partners',
            setupLabel: 'Get MoonPay partner keys',
          },
        ].map(r => {
          const isLive = r.data.note.startsWith('Live:')
          return (
            <div key={r.key} className={`card p-4 border ${isLive ? 'border-emerald-500/20' : 'border-yellow-500/20'}`}>
              <div className="flex items-center gap-2 mb-2">
                {isLive
                  ? <CheckCircle size={14} className="text-emerald-400 shrink-0"/>
                  : <AlertCircle size={14} className="text-yellow-400 shrink-0"/>
                }
                <span className="font-semibold text-sm text-white">{r.label}</span>
              </div>
              <p className="text-xs text-dark-400 leading-relaxed mb-2">{r.data.note}</p>
              <p className={`text-xs font-medium mb-3 ${isLive ? 'text-emerald-400' : 'text-yellow-400'}`}>
                {r.data.earns}
              </p>
              {!isLive && (
                <a href={r.setupUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300">
                  <ExternalLink size={11}/> {r.setupLabel}
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Today's routing stats */}
      {today && (
        <div className="card">
          <div className="card-header">
            <span className="font-semibold text-sm">Today's routing activity</span>
          </div>
          <div className="grid grid-cols-2 gap-0 divide-x divide-dark-800">
            {[
              { label: 'Swaps via 1inch',       val: today.swaps?.oneinch?.count  || 0, sub: `$${(today.swaps?.oneinch?.earned  || 0).toFixed(2)} earned` },
              { label: 'Swaps via estimate',     val: today.swaps?.internal?.count || 0, sub: `$${(today.swaps?.internal?.earned || 0).toFixed(2)} earned` },
            ].map(s => (
              <div key={s.label} className="p-5">
                <p className="text-xs text-dark-400">{s.label}</p>
                <p className="text-2xl font-bold font-mono text-white mt-1">{s.val}</p>
                <p className="text-xs text-emerald-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue by source */}
      {revenue?.revenue?.bySource && revenue.revenue.bySource.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="font-semibold text-sm">Revenue by source</span></div>
          <div className="divide-y divide-dark-800">
            {revenue.revenue.bySource.map((s: any) => (
              <div key={s.source} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-dark-500">{s.source}</p>
                  <p className="text-xs text-dark-400">{s.count} events</p>
                </div>
                <span className="font-mono font-semibold text-emerald-400">${s.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
