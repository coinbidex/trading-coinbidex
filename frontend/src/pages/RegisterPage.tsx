import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, UserPlus, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const { register, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '', referralCode: '' })
  const [showPw, setShowPw] = useState(false)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) { toast.error('Passwords do not match'); return }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    try {
      await register({ email: form.email, username: form.username, password: form.password, referralCode: form.referralCode || undefined })
      toast.success('Account created. Please verify your email before signing in.')
      // Carry the original intended destination (if any) through to /login,
      // so logging in after verifying still lands back where the user
      // actually wanted to go, not just /dashboard.
      navigate('/login', { state: location.state })
    } catch (err: any) {
      toast.error(err.message || 'Registration failed')
    }
  }

  return (
    <div className="animate-fade-in">
      <span className="badge badge-blue">
        <ShieldCheck size={11} /> Enterprise Secure Onboarding
      </span>
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mt-3 mb-1">Create your account</h2>
      <p className="text-dark-400 text-sm mb-7">Join 500,000+ traders on Coinbidex</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5">Email</label>
            <input className="input" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5">Username</label>
            <input className="input" type="text" placeholder="trader123" value={form.username} onChange={set('username')} required minLength={3} maxLength={20} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5">Password</label>
          <div className="relative">
            <input className="input pr-10" type={showPw ? 'text' : 'password'} placeholder="Min 8 chars, 1 number" value={form.password} onChange={set('password')} required />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white">
              {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5">Confirm password</label>
          <input className="input" type="password" placeholder="Repeat password" value={form.confirm} onChange={set('confirm')} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5">Referral code <span className="text-dark-500">(optional)</span></label>
          <input className="input" type="text" placeholder="e.g. CRYPTEX20" value={form.referralCode} onChange={set('referralCode')} />
        </div>

        <button type="submit" disabled={isLoading} className="btn-primary w-full py-2.5 mt-2">
          {isLoading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
          ) : (
            <span className="flex items-center gap-2"><UserPlus size={16}/> Create account</span>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-dark-500 mt-4">
        By signing up you agree to our{' '}
        <a href="#" className="text-brand-400 hover:underline">Terms</a> and{' '}
        <a href="#" className="text-brand-400 hover:underline">Privacy Policy</a>
      </p>

      <p className="text-center text-sm text-dark-400 mt-4">
        Already have an account?{' '}
        <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">Sign in</Link>
      </p>
    </div>
  )
}
