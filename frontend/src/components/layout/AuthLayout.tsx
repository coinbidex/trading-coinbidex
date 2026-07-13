import { Outlet, Navigate } from 'react-router-dom'
import { ShieldCheck, Lock, Globe2, Zap, TrendingUp, TrendingDown } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import CoinIcon from '@/components/ui/CoinIcon'
import { useLivePrices } from '@/hooks/useLivePrices'
import { fmt, colorClass } from '@/utils/format'

const SHOWCASE = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP']

const TRUST_ITEMS = [
  { icon: ShieldCheck, title: 'Bank-grade custody', desc: 'Multi-signature cold storage with insured hot-wallet reserves.' },
  { icon: Lock,        title: '2FA & hardware-key support', desc: 'TOTP, passkeys and withdrawal whitelists on every account.' },
  { icon: Globe2,      title: '150+ countries served', desc: 'Regulated liquidity partners across major global markets.' },
  { icon: Zap,         title: 'Sub-50ms matching engine', desc: 'Institutional-grade order routing and execution.' },
]

export default function AuthLayout() {
  const { isAuthenticated } = useAuthStore()
  const { get } = useLivePrices()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-white dark:bg-dark-950 flex">
      {/* Left — brand / trust panel */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between overflow-hidden bg-dark-950 text-white p-12 xl:p-16">
        <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-40" />
        <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] bg-brand-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-brand-500/10 rounded-full blur-3xl" />

        <div className="relative z-10">
          <Logo size="md" variant="full" />

          <h1 className="mt-14 text-4xl xl:text-[2.75rem] font-display font-bold leading-tight max-w-lg">
            The enterprise trading infrastructure for digital assets.
          </h1>
          <p className="mt-4 text-dark-300 max-w-md text-[15px] leading-relaxed">
            Deep liquidity, institutional security and a matching engine built for scale — trusted by traders and treasuries alike.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-5 max-w-lg">
            {TRUST_ITEMS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <span className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-brand-400" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-dark-400 mt-0.5 leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live market showcase */}
        <div className="relative z-10 mt-10">
          <p className="text-[11px] uppercase tracking-widest text-dark-400 font-semibold mb-3">Live market data</p>
          <div className="grid grid-cols-5 gap-2">
            {SHOWCASE.map(sym => {
              const live = get(sym)
              return (
                <div key={sym} className="rounded-xl bg-white/5 border border-white/10 p-3 backdrop-blur-sm">
                  <div className="flex items-center gap-1.5 mb-2">
                    <CoinIcon symbol={sym} size={16} />
                    <span className="text-xs font-semibold text-dark-200">{sym}</span>
                  </div>
                  <p className="font-mono text-sm font-semibold text-white truncate">
                    {live ? `$${fmt.price(live.price)}` : <span className="inline-block w-12 h-3.5 bg-white/10 rounded animate-pulse" />}
                  </p>
                  {live && (
                    <p className={`text-[11px] font-mono flex items-center gap-0.5 mt-0.5 ${colorClass(live.changePct)}`}>
                      {live.changePct >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                      {fmt.pct(live.changePct)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-8 text-xs text-dark-500">
            <span>© {new Date().getFullYear()} Coinbidex. All rights reserved.</span>
            <a href="#" className="hover:text-dark-300">Security</a>
            <a href="#" className="hover:text-dark-300">Compliance</a>
            <a href="#" className="hover:text-dark-300">Status</a>
          </div>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-6 lg:justify-end border-b border-dark-100 dark:border-dark-800 lg:border-0">
          <Logo size="sm" variant="full" className="lg:hidden" />
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[400px]">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
