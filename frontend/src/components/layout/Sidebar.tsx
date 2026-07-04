import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, ArrowLeftRight, BarChart2,
  Wallet, ClipboardList, Layers, Megaphone, User,
  LogOut, ShieldCheck, ChevronRight
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import { ModeBadge } from '@/components/mode/DemoGate'
import toast from 'react-hot-toast'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard',  to: '/dashboard',  group: 'Trading' },
  { icon: TrendingUp,      label: 'Trade',      to: '/trade',      group: 'Trading' },
  { icon: ArrowLeftRight,  label: 'Swap',       to: '/swap',       group: 'Trading' },
  { icon: BarChart2,       label: 'Markets',    to: '/markets',    group: 'Trading' },
  { icon: Wallet,          label: 'Wallet',     to: '/wallet',     group: 'Trading' },
  { icon: ClipboardList,   label: 'Orders',     to: '/orders',     group: 'Trading' },
  { icon: Layers,          label: 'List Token', to: '/listing',    group: 'Platform' },
  { icon: Megaphone,       label: 'Advertise',  to: '/advertise',  group: 'Platform' },
  { icon: User,            label: 'Profile',    to: '/profile',    group: 'Platform' },
]

export default function Sidebar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    toast.success('Signed out')
    navigate('/login')
  }

  const groups = ['Trading', 'Platform']

  return (
    <aside className="hidden lg:flex flex-col w-60 bg-white dark:bg-dark-900 border-r border-dark-100 dark:border-dark-800 h-full shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-dark-100 dark:border-dark-800">
        <div className="flex items-center gap-2">
          <Logo size="md" variant="full"/>
          <ModeBadge/>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-4">
        {groups.map(group => (
          <div key={group}>
            <p className="text-[10px] text-dark-400 dark:text-dark-500 font-semibold uppercase tracking-widest px-3 pb-2">{group}</p>
            <div className="space-y-0.5">
              {navItems.filter(i => i.group === group).map(({ icon: Icon, label, to }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-100 dark:border-brand-500/20'
                        : 'text-dark-500 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white hover:bg-dark-50 dark:hover:bg-dark-800'
                    }`
                  }
                >
                  <Icon size={16}/>
                  <span className="flex-1">{label}</span>
                  <ChevronRight size={12} className="opacity-0 group-hover:opacity-40 transition-opacity"/>
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {user?.role === 'ADMIN' && (
          <div>
            <p className="text-[10px] text-dark-400 dark:text-dark-500 font-semibold uppercase tracking-widest px-3 pb-2">Admin</p>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20'
                    : 'text-dark-500 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white hover:bg-dark-50 dark:hover:bg-dark-800'
                }`
              }
            >
              <ShieldCheck size={16}/>
              Admin Panel
            </NavLink>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-dark-100 dark:border-dark-800">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg mb-1">
          <div className="w-8 h-8 bg-brand-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-dark-900 dark:text-white truncate">{user?.username}</p>
            <p className="text-xs text-dark-400 truncate">{user?.role}</p>
          </div>
          <ThemeToggle/>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-dark-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/5 rounded-lg transition-colors"
        >
          <LogOut size={14}/> Sign out
        </button>
      </div>
    </aside>
  )
}
