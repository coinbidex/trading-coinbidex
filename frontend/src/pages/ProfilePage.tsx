import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { User, Bell, Shield, Key, Copy, CheckCircle } from 'lucide-react'
import api from '@/utils/api'
import { useAuthStore } from '@/store/authStore'
import { fmt } from '@/utils/format'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'profile'|'security'|'alerts'>('profile')
  const [copied, setCopied] = useState(false)
  const [alertForm, setAlertForm] = useState({ symbol: 'BTC', condition: 'above', price: '' })
  const [profileForm, setProfileForm] = useState({ firstName: user?.username || '', lastName: '', phone: '', country: '' })

  const { data: alerts } = useQuery({
    queryKey: ['price-alerts'],
    queryFn: () => api.get('/users/price-alerts').then(r => r.data.data),
  })

  const profileMutation = useMutation({
    mutationFn: () => api.patch('/users/profile', profileForm),
    onSuccess: () => toast.success('Profile updated!'),
    onError: () => toast.error('Update failed')
  })

  const alertMutation = useMutation({
    mutationFn: () => api.post('/users/price-alert', { ...alertForm, price: parseFloat(alertForm.price) }),
    onSuccess: () => { toast.success('Alert created!'); qc.invalidateQueries({ queryKey: ['price-alerts'] }); setAlertForm(f=>({...f,price:''})) },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed')
  })

  const deleteAlert = useMutation({
    mutationFn: (id: string) => api.delete(`/users/price-alerts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-alerts'] })
  })

  const copyReferral = () => {
    navigator.clipboard.writeText(user?.referralCode || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Referral code copied!')
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2"><User size={22} className="text-brand-400"/> Profile</h1>

      <div className="flex gap-1 border-b">
        {[['profile','Profile'],['security','Security'],['alerts','Price Alerts']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k as any)} className={tab===k?'tab-active':'tab'}>{l}</button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="space-y-5">
          <div className="card p-5 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-2xl font-bold">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-white text-lg">{user?.username}</p>
              <p className="text-dark-400 text-sm">{user?.role}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge ${user?.kycStatus==='APPROVED'?'badge-green':'badge-yellow'}`}>{user?.kycStatus?.replace('_',' ')}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="font-semibold text-sm">Personal Info</span></div>
            <div className="card-body space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                {[['firstName','First Name'],['lastName','Last Name'],['phone','Phone'],['country','Country']].map(([k,l])=>(
                  <div key={k}><label className="text-xs text-dark-300 mb-1.5 block">{l}</label>
                    <input className="input" value={(profileForm as any)[k]} onChange={e=>setProfileForm(f=>({...f,[k]:e.target.value}))} placeholder={l}/>
                  </div>
                ))}
              </div>
              <button onClick={()=>profileMutation.mutate()} disabled={profileMutation.isPending} className="btn-primary btn-sm">
                {profileMutation.isPending?'Saving...':'Save Changes'}
              </button>
            </div>
          </div>

          <div className="card p-5">
            <p className="text-xs text-dark-400 mb-2 font-medium uppercase tracking-wide">Referral Code</p>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-dark-800 rounded-lg px-4 py-2.5 font-mono text-brand-400 text-sm border border-dark-700">{user?.referralCode}</code>
              <button onClick={copyReferral} className="btn-secondary btn-sm">
                {copied ? <CheckCircle size={14} className="text-emerald-400"/> : <Copy size={14}/>}
              </button>
            </div>
            <p className="text-xs text-dark-500 mt-2">Earn rewards when friends sign up with your code</p>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-4">
          <div className="card">
            <div className="card-header"><div className="flex items-center gap-2"><Shield size={15} className="text-brand-400"/><span className="font-semibold text-sm">Security Settings</span></div></div>
            <div className="card-body space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                <div><p className="text-sm font-medium text-white">Two-Factor Authentication</p><p className="text-xs text-dark-400 mt-0.5">Add an extra layer of security</p></div>
                <span className={`badge ${user?.twoFactorEnabled?'badge-green':'badge-gray'}`}>{user?.twoFactorEnabled?'Enabled':'Disabled'}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                <div><p className="text-sm font-medium text-white">Email Verified</p><p className="text-xs text-dark-400 mt-0.5">{user?.email}</p></div>
                <CheckCircle size={16} className="text-emerald-400"/>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                <div><p className="text-sm font-medium text-white">KYC Verification</p><p className="text-xs text-dark-400 mt-0.5">Required for withdrawals</p></div>
                <span className={`badge ${user?.kycStatus==='APPROVED'?'badge-green':'badge-yellow'}`}>{user?.kycStatus?.replace('_',' ')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <div className="space-y-4">
          <div className="card">
            <div className="card-header"><div className="flex items-center gap-2"><Bell size={15} className="text-brand-400"/><span className="font-semibold text-sm">Create Alert</span></div></div>
            <div className="card-body">
              <div className="flex gap-3">
                <select value={alertForm.symbol} onChange={e=>setAlertForm(f=>({...f,symbol:e.target.value}))} className="input w-28">
                  {['BTC','ETH','BNB','SOL','XRP','ADA','DOGE'].map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <select value={alertForm.condition} onChange={e=>setAlertForm(f=>({...f,condition:e.target.value}))} className="input w-28">
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                </select>
                <input className="input flex-1 font-mono" type="number" placeholder="Price" value={alertForm.price} onChange={e=>setAlertForm(f=>({...f,price:e.target.value}))}/>
                <button onClick={()=>alertMutation.mutate()} disabled={!alertForm.price||alertMutation.isPending} className="btn-primary whitespace-nowrap">Add Alert</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="font-semibold text-sm">Active Alerts</span></div>
            {alerts && alerts.length > 0 ? alerts.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3 border-b border-dark-800 last:border-0">
                <div className="flex items-center gap-3">
                  <Bell size={14} className={a.triggered?'text-dark-500':'text-brand-400'}/>
                  <span className="font-medium text-white">{a.asset?.symbol}</span>
                  <span className="text-dark-400 text-sm">{a.condition} ${fmt.price(a.price)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${a.triggered?'badge-gray':a.isActive?'badge-green':'badge-gray'}`}>{a.triggered?'Triggered':a.isActive?'Active':'Inactive'}</span>
                  <button onClick={()=>deleteAlert.mutate(a.id)} className="btn-ghost btn-sm text-red-400 text-xs">✕</button>
                </div>
              </div>
            )) : <div className="px-5 py-8 text-center text-dark-400 text-sm">No alerts set</div>}
          </div>
        </div>
      )}
    </div>
  )
}
