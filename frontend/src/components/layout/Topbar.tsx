import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Search, X, Menu } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/utils/api'
import { useAuthStore } from '@/store/authStore'
import { fmt } from '@/utils/format'
import WalletButton from '@/components/ui/WalletButton'
import ModeBadge from '@/components/ui/ModeBadge'
import ThemeToggle from '@/components/ui/ThemeToggle'
import Logo from '@/components/ui/Logo'
import CoinIcon from '@/components/ui/CoinIcon'

export default function Topbar() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showResults, setShowResults] = useState(false)
  const [showNotifs, setShowNotifs] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const { data: searchResults } = useQuery({
    queryKey: ['search', search],
    queryFn: () => api.get(`/markets/search?q=${search}`).then(r => r.data.data),
    enabled: search.length >= 2,
  })

  const { data: notifData, refetch: refetchNotifs } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get('/notifications?limit=5&unread=true').then(r => r.data.data),
    refetchInterval: 30000,
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unreadCount = notifData?.unreadCount || 0

  const markAllRead = async () => {
    await api.patch('/notifications/read-all')
    refetchNotifs()
    setShowNotifs(false)
  }

  return (
    <header className="h-14 bg-white dark:bg-dark-900 border-b border-dark-100 dark:border-dark-800 flex items-center justify-between px-4 lg:px-6 shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3 flex-1">
        <Logo size="sm" variant="full" className="lg:hidden"/>
        <div ref={searchRef} className="relative hidden sm:block w-64 lg:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"/>
          <input
            className="input pl-9 pr-3 py-1.5 text-sm"
            placeholder="Search markets..."
            value={search}
            onChange={e => { setSearch(e.target.value); setShowResults(true) }}
            onFocus={() => search.length >= 2 && setShowResults(true)}
          />
          {search && (
            <button onClick={() => { setSearch(''); setShowResults(false) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600 dark:hover:text-white">
              <X size={12}/>
            </button>
          )}
          {showResults && searchResults && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 w-full card shadow-xl z-50 overflow-hidden">
              {searchResults.map((m: any) => (
                <button
                  key={m.id}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-50 dark:hover:bg-dark-800 text-left transition-colors"
                  onClick={() => { navigate(`/trade/${m.symbol}`); setShowResults(false); setSearch('') }}
                >
                  <CoinIcon symbol={m.symbol} src={m.baseAsset?.logoUrl} size={24} />
                  <div>
                    <p className="text-sm font-medium text-dark-900 dark:text-white">{m.symbol}</p>
                    <p className="text-xs text-dark-400">{m.baseAsset?.name}</p>
                  </div>
                  {m.ticker && (
                    <span className={`ml-auto text-xs font-mono ${parseFloat(m.ticker.priceChangePct) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {fmt.pct(m.ticker.priceChangePct)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Theme toggle — visible on mobile only (sidebar has it on desktop) */}
        <ThemeToggle className="lg:hidden"/>

        <ModeBadge/>
        <WalletButton/>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 text-dark-400 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-dark-800 rounded-lg transition-colors"
          >
            <Bell size={17}/>
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-brand-500 rounded-full text-[9px] flex items-center justify-center text-white font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {showNotifs && (
            <div className="absolute right-0 top-full mt-2 w-80 card shadow-xl z-50">
              <div className="px-4 py-3 border-b border-dark-100 dark:border-dark-800 flex items-center justify-between">
                <p className="text-sm font-semibold text-dark-900 dark:text-white">Notifications</p>
                <button className="text-xs text-brand-500 hover:text-brand-600" onClick={markAllRead}>Mark all read</button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifData?.notifications?.length > 0 ? notifData.notifications.map((n: any) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-dark-100 dark:border-dark-800 last:border-0 ${!n.isRead ? 'bg-brand-50/50 dark:bg-brand-500/5' : ''}`}>
                    <p className="text-sm font-medium text-dark-900 dark:text-white">{n.title}</p>
                    <p className="text-xs text-dark-400 mt-0.5">{n.message}</p>
                    <p className="text-xs text-dark-300 dark:text-dark-500 mt-1">{fmt.timeAgo(n.createdAt)}</p>
                  </div>
                )) : (
                  <div className="px-4 py-8 text-center text-dark-400 text-sm">No notifications</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-50 dark:bg-dark-800 border border-dark-200 dark:border-dark-700">
          <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-medium text-dark-900 dark:text-white">{user?.username}</span>
        </div>
      </div>
    </header>
  )
}
