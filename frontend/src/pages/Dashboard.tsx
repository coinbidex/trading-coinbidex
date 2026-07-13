import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Wallet, Activity, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '@/utils/api'
import { useAuthStore } from '@/store/authStore'
import { fmt, colorClass } from '@/utils/format'
import CoinIcon from '@/components/ui/CoinIcon'
import { useLivePrices } from '@/hooks/useLivePrices'

export default function Dashboard() {
  const { user } = useAuthStore()
  const { get: getLive } = useLivePrices()

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => api.get('/wallets').then(r => r.data.data),
  })

  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'open'],
    queryFn: () => api.get('/orders?status=OPEN&limit=5').then(r => r.data.data),
  })

  const { data: txData } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.get('/transactions?limit=5').then(r => r.data.data),
  })

  const { data: tickers } = useQuery({
    queryKey: ['tickers'],
    queryFn: () => api.get('/markets/tickers').then(r => r.data.data),
    refetchInterval: 30000,
  })

  const topGainers = [...(tickers || [])].sort((a: any, b: any) => (b.priceChangePct || 0) - (a.priceChangePct || 0)).slice(0, 5)
  const topLosers = [...(tickers || [])].sort((a: any, b: any) => (a.priceChangePct || 0) - (b.priceChangePct || 0)).slice(0, 5)

  const totalBalance = wallets?.reduce((sum: number, w: any) => sum + parseFloat(w.balance || '0'), 0) || 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.username} 👋
          </h1>
          <p className="text-dark-400 text-sm mt-0.5">Here's what's happening in your portfolio today.</p>
        </div>
        <Link to="/trade" className="btn-primary hidden sm:flex">
          <TrendingUp size={16} /> Start Trading
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <span className="stat-label">Portfolio Value</span>
          <span className="stat-value text-brand-400">{fmt.usd(totalBalance)}</span>
          <span className="stat-change text-dark-400">Across {wallets?.filter((w: any) => parseFloat(w.balance) > 0).length || 0} assets</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Open Orders</span>
          <span className="stat-value text-white">{ordersData?.pagination?.total || 0}</span>
          <Link to="/orders" className="stat-change text-brand-400 hover:underline text-xs">View all →</Link>
        </div>
        <div className="stat-card">
          <span className="stat-label">24h Gainers</span>
          <span className="stat-value text-emerald-400">{topGainers.length}</span>
          <span className="stat-change text-dark-400">Active markets</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">KYC Status</span>
          <span className={`text-sm font-semibold mt-1 ${user?.kycStatus === 'APPROVED' ? 'text-emerald-400' : 'text-yellow-400'}`}>
            {user?.kycStatus?.replace('_', ' ')}
          </span>
          <span className="stat-change text-dark-400">{user?.role}</span>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Wallet balances */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Wallet size={16} className="text-brand-400" />
              <span className="font-semibold text-sm">Wallet Balances</span>
            </div>
            <Link to="/wallet" className="text-xs text-brand-400 hover:text-brand-300">Manage →</Link>
          </div>
          <div className="divide-y divide-dark-800">
            {wallets?.filter((w: any) => parseFloat(w.balance) > 0).slice(0, 6).map((w: any) => (
              <div key={w.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={w.asset?.symbol || ''} src={w.asset?.logoUrl} size={32} />
                  <div>
                    <p className="text-sm font-semibold text-white">{w.asset?.symbol}</p>
                    <p className="text-xs text-dark-400">{w.asset?.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-medium text-dark-500">{fmt.qty(w.balance)}</p>
                  {parseFloat(w.lockedBalance) > 0 && (
                    <p className="text-xs text-yellow-400/70 font-mono">{fmt.qty(w.lockedBalance)} locked</p>
                  )}
                </div>
              </div>
            ))}
            {(!wallets || wallets.filter((w: any) => parseFloat(w.balance) > 0).length === 0) && (
              <div className="px-5 py-10 text-center">
                <Wallet size={28} className="text-dark-600 mx-auto mb-3" />
                <p className="text-dark-400 text-sm">No balances yet</p>
                <Link to="/wallet" className="btn-primary btn-sm mt-3">Deposit Funds</Link>
              </div>
            )}
          </div>
        </div>

        {/* Top movers */}
        <div className="space-y-4">
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <TrendingUp size={15} className="text-emerald-400" />
                <span className="font-semibold text-sm">Top Gainers</span>
              </div>
            </div>
            <div className="divide-y ">
              {topGainers.map((t: any) => {
                const live = getLive(t.symbol)
                const price = t.lastPrice > 0 ? t.lastPrice : (live?.price ?? 0)
                const pct = t.priceChangePct || live?.changePct || 0
                return (
                  <Link key={t.symbol} to={`/trade/${t.symbol}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-dark-50 dark:hover:bg-dark-800/50 transition-colors">
                    <span className="flex items-center gap-2 text-sm font-medium text-dark-700 dark:text-dark-200">
                      <CoinIcon symbol={t.symbol} size={20} /> {t.symbol.replace('USDT', '')}
                    </span>
                    <div className="text-right">
                      <p className="text-xs font-mono text-dark-700 dark:text-dark-300">${fmt.price(price)}</p>
                      <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{fmt.pct(pct)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <TrendingDown size={15} className="text-red-400" />
                <span className="font-semibold text-sm">Top Losers</span>
              </div>
            </div>
            <div className="divide-y">
              {topLosers.map((t: any) => {
                const live = getLive(t.symbol)
                const price = t.lastPrice > 0 ? t.lastPrice : (live?.price ?? 0)
                const pct = t.priceChangePct || live?.changePct || 0
                return (
                  <Link key={t.symbol} to={`/trade/${t.symbol}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-dark-50 dark:hover:bg-dark-800/50 transition-colors">
                    <span className="flex items-center gap-2 text-sm font-medium text-dark-700 dark:text-dark-200">
                      <CoinIcon symbol={t.symbol} size={20} /> {t.symbol.replace('USDT', '')}
                    </span>
                    <div className="text-right">
                      <p className="text-xs font-mono text-dark-700 dark:text-dark-300">${fmt.price(price)}</p>
                      <p className="text-xs font-mono text-red-600 dark:text-red-400">{fmt.pct(pct)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-brand-400" />
            <span className="font-semibold text-sm">Recent Activity</span>
          </div>
          <Link to="/orders" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">View all <ArrowRight size={12}/></Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {['Type', 'Asset', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-xs text-dark-400 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txData?.transactions?.map((tx: any) => (
                <tr key={tx.id} className="border-b table-row-hover">
                  <td className="px-5 py-3">
                    <span className={`badge ${tx.type === 'DEPOSIT' ? 'badge-green' : tx.type === 'WITHDRAWAL' ? 'badge-red' : 'badge-blue'}`}>
                      {tx.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono font-medium text-dark-500">{tx.asset}</td>
                  <td className="px-5 py-3 font-mono text-dark-500">{fmt.qty(tx.amount)}</td>
                  <td className="px-5 py-3">
                    <span className={`badge ${tx.status === 'COMPLETED' ? 'badge-green' : tx.status === 'FAILED' ? 'badge-red' : 'badge-yellow'}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-dark-400 text-xs">{fmt.timeAgo(tx.createdAt)}</td>
                </tr>
              ))}
              {(!txData?.transactions || txData.transactions.length === 0) && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-dark-400 text-sm">No transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
