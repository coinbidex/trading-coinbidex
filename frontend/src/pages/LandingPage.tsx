import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, TrendingUp, TrendingDown, Shield, Zap, ArrowLeftRight, Layers, Megaphone, ChevronRight, Cpu } from 'lucide-react'
import api from '@/utils/api'
import { fmt } from '@/utils/format'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'

const SYMS = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','MATIC','LINK','AVAX','DOT','UNI','LTC','ATOM','TRX']

export default function LandingPage() {
  const [tickerData, setTickerData] = useState<Record<string,any>>({})

  const { data: tickers } = useQuery({
    queryKey: ['landing-tickers'],
    queryFn: () => api.get('/markets/tickers').then(r => r.data.data),
    refetchInterval: 10000,
  })

  useEffect(() => {
    if (tickers) {
      const map: Record<string,any> = {}
      tickers.forEach((t: any) => { map[t.symbol] = t })
      setTickerData(map)
    }
  }, [tickers])

  return (
    <div className="min-h-screen bg-white dark:bg-dark-950 text-dark-900 dark:text-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-dark-100 dark:border-dark-800/80 bg-white/90 dark:bg-dark-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo size="md" variant="full"/>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-dark-500 dark:text-dark-400">
            {['Markets','Trade','Swap'].map(item => (
              <Link key={item} to={`/${item.toLowerCase()}`} className="hover:text-brand-500 transition-colors">{item}</Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle/>
            <Link to="/login"    className="btn-ghost btn-sm hidden sm:flex">Sign in</Link>
            <Link to="/register" className="btn-primary btn-sm">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-100 pointer-events-none"/>
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-brand-500/5 dark:bg-brand-500/8 rounded-full blur-3xl pointer-events-none"/>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-50 dark:bg-brand-500/10 border border-brand-100 dark:border-brand-500/20 rounded-full text-xs font-medium text-brand-600 dark:text-brand-400 mb-8">
            <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse"/>
            Live markets · 30+ trading pairs · Real-time data
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6">
            Trade Crypto<br/><span className="text-gradient">Like a Pro</span>
          </h1>
          <p className="text-dark-500 dark:text-dark-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Professional-grade trading terminal with real-time charts, instant swaps, multi-wallet support, and everything you need to trade smarter.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link to="/register" className="btn-primary btn-lg px-8 glow-brand">
              Start Trading Free <ArrowRight size={16}/>
            </Link>
            <Link to="/markets" className="btn-secondary btn-lg px-8">View Markets</Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[{label:'Trading Pairs',value:'30+'},{label:'Daily Volume',value:'$2.4B+'},{label:'Active Traders',value:'500K+'},{label:'Countries',value:'100+'}].map(s=>(
              <div key={s.label} className="card p-4 text-center">
                <p className="font-display text-2xl font-bold text-brand-500">{s.value}</p>
                <p className="text-xs text-dark-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ticker bar */}
      <div className="border-y border-dark-100 dark:border-dark-800 bg-dark-50 dark:bg-dark-900/50 overflow-hidden py-3">
        <div className="flex animate-ticker-scroll whitespace-nowrap">
          {[...SYMS,...SYMS].map((sym,i)=>{
            const t = tickerData[`${sym}USDT`]
            return (
              <div key={i} className="inline-flex items-center gap-2 px-6 border-r border-dark-100 dark:border-dark-800">
                <span className="text-sm font-semibold text-dark-700 dark:text-dark-200">{sym}</span>
                <span className="text-sm font-mono text-dark-900 dark:text-white">${fmt.price(t?.lastPrice||0)}</span>
                <span className={`text-xs font-mono ${(t?.priceChangePct||0)>=0?'text-emerald-600 dark:text-emerald-400':'text-red-500 dark:text-red-400'}`}>
                  {t?fmt.pct(t.priceChangePct):'—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Market table */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display text-3xl font-bold">Live Markets</h2>
              <p className="text-dark-400 mt-1">Real-time prices from global exchanges</p>
            </div>
            <Link to="/markets" className="btn-secondary btn-sm flex items-center gap-1.5">View all <ChevronRight size={14}/></Link>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-dark-50 dark:bg-dark-800/50">
                <tr className="border-b border-dark-100 dark:border-dark-800">
                  {['#','Asset','Price','24h Change','Volume',''].map(h=>(
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SYMS.slice(0,8).map((sym,i)=>{
                  const t = tickerData[`${sym}USDT`]
                  const pct = t?.priceChangePct||0
                  return (
                    <tr key={sym} className="border-b border-dark-100 dark:border-dark-800 hover:bg-dark-50 dark:hover:bg-dark-800/30 transition-colors">
                      <td className="px-5 py-3.5 text-dark-400 text-xs">{i+1}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-brand-100 dark:bg-brand-500/20 rounded-full flex items-center justify-center">
                            <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400">{sym.slice(0,2)}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-dark-900 dark:text-white">{sym}</p>
                            <p className="text-xs text-dark-400">{sym}/USDT</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono font-semibold text-dark-900 dark:text-white">${fmt.price(t?.lastPrice||0)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`badge ${pct>=0?'badge-green':'badge-red'}`}>
                          {pct>=0?<TrendingUp size={10}/>:<TrendingDown size={10}/>}{fmt.pct(pct)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-dark-400 text-xs">{fmt.volume((t?.lastPrice||0)*(t?.volume24h||0))}</td>
                      <td className="px-5 py-3.5"><Link to={`/trade/${sym}USDT`} className="btn-primary btn-sm">Trade</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-dark-50 dark:bg-dark-900/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">Everything you need to trade</h2>
            <p className="text-dark-400 max-w-xl mx-auto">One platform, infinite possibilities.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {icon:TrendingUp,    color:'text-brand-500',  bg:'bg-brand-50 dark:bg-brand-500/10',   title:'Advanced Trading',      desc:'Limit, market, and stop orders with real-time order books, professional charts, and instant execution.'},
              {icon:ArrowLeftRight,color:'text-emerald-500',bg:'bg-emerald-50 dark:bg-emerald-500/10',title:'Instant Swap',          desc:'Swap 100+ assets at best DEX rates via 1inch aggregation. Minimum fees, maximum value.'},
              {icon:Shield,        color:'text-blue-500',   bg:'bg-blue-50 dark:bg-blue-500/10',     title:'Non-Custodial Wallets', desc:'Connect MetaMask, WalletConnect, or any web3 wallet. Your keys, your crypto.'},
              {icon:Layers,        color:'text-purple-500', bg:'bg-purple-50 dark:bg-purple-500/10', title:'Token Listings',        desc:'List your project and reach our active trading community immediately.'},
              {icon:Megaphone,     color:'text-orange-500', bg:'bg-orange-50 dark:bg-orange-500/10', title:'Targeted Advertising',  desc:'Precision-targeted ads to crypto traders via banners, sponsored listings, and push notifications.'},
              {icon:Cpu,           color:'text-pink-500',   bg:'bg-pink-50 dark:bg-pink-500/10',     title:'Real-Time Data',        desc:'Live WebSocket feeds, OHLCV charts, order depth, and market news — all in one place.'},
            ].map(f=>(
              <div key={f.title} className="card p-6 hover:border-brand-200 dark:hover:border-brand-500/30 hover:-translate-y-1 transition-all duration-300">
                <div className={`w-11 h-11 ${f.bg} rounded-xl flex items-center justify-center mb-4`}>
                  <f.icon size={20} className={f.color}/>
                </div>
                <h3 className="font-semibold text-dark-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-dark-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="card p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-blue-500/5 pointer-events-none"/>
            <div className="relative z-10">
              <h2 className="font-display text-4xl font-bold mb-4">Ready to trade?</h2>
              <p className="text-dark-400 mb-8 max-w-md mx-auto">Join 500,000+ traders. Start with demo funds instantly, no credit card required.</p>
              <Link to="/register" className="btn-primary btn-lg px-10 glow-brand">
                Create Free Account <ArrowRight size={16}/>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-dark-100 dark:border-dark-800 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size="sm" variant="full"/>
          <p className="text-dark-400 text-sm text-center">© 2024 Coinbidex. All rights reserved. Trading crypto involves risk.</p>
          <div className="flex gap-4 text-sm text-dark-400">
            <a href="#" className="hover:text-brand-500 transition-colors">Terms</a>
            <a href="#" className="hover:text-brand-500 transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
