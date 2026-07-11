import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  // If Protected/AdminOnly bounced the user here, location.state.from holds
  // where they were actually trying to go — send them back there instead of
  // always landing on /dashboard. Falls back to /dashboard for a direct,
  // unprompted visit to /login (state is undefined in that case).
  const from = (location.state as { from?: Location })?.from
  const redirectTo = from ? `${from.pathname}${from.search ?? ''}` : '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      toast.success('Welcome back!')
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      const message = err.message || 'Login failed'
      setError(message)

      if (message.includes('verify your email')) {
        toast.error('Please verify your email first.')
      }
    }
  }

  const demoLogin = async (role: 'trader'|'admin') => {
    try {
      const creds = role === 'admin'
        ? { email: 'admin@coinbidex.io', password: 'Admin@123456' }
        : { email: 'demo@coinbidex.io',  password: 'Demo@123456'  }
      await login(creds.email, creds.password)
      toast.success(`${role === 'admin' ? 'Admin' : 'Demo'} mode activated!`)
      navigate(redirectTo, { replace: true })
    } catch {
      toast.error('Demo login failed — run the seeder first')
    }
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-1 text-center">Welcome back</h2>
      <p className="text-dark-400 text-sm mb-8 text-center">Sign in to your Coinbidex account</p>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-lg px-3 py-2.5 mb-4 text-sm">
          <AlertCircle size={14} className="shrink-0"/>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5">Email address</label>
          <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-dark-500 dark:text-dark-300">Password</label>
            <Link to="/forgot-password" className="text-xs text-brand-500 hover:text-brand-600">Forgot password?</Link>
          </div>
          <div className="relative">
            <input className="input pr-10" type={showPw?'text':'password'} placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/>
            <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600 dark:hover:text-white">
              {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
          </div>
        </div>
        <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 mt-2">
          {isLoading
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
            : <><LogIn size={16}/> Sign in</>
          }
        </button>
      </form>
      <p className="text-center text-sm text-dark-400 mt-6">
        No account? <Link to="/register" className="text-brand-500 hover:text-brand-600 font-medium">Create one free</Link>
      </p>
    </div>
  )
}
