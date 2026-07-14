import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck, Users, BarChart2, Layers, CheckCircle,
  XCircle, DollarSign, Settings, Eye, Edit2, Trash2,
  Plus, Save, Info, ExternalLink
} from 'lucide-react'
import api from '@/utils/api'
import { fmt, cn } from '@/utils/format'
import toast from 'react-hot-toast'
import RoutingStatus from '@/components/ui/RoutingStatus'

type AdminTab = 'dashboard' | 'revenue' | 'users' | 'listings' | 'ads' | 'withdrawals' | 'config'

// ── Config Manager ────────────────────────────────────────────
// SINGLE declaration of ConfigManager - no duplicates
function ConfigManager() {
  const qc = useQueryClient()
  const [editing, setEditing]       = useState<string | null>(null)
  const [editVal, setEditVal]       = useState('')
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [showAdd, setShowAdd]       = useState(false)
  const [newKey, setNewKey]         = useState({ key: '', value: '', description: '' })
  const [filter, setFilter]         = useState('')

  const { data: configs, isLoading } = useQuery<any[]>({
    queryKey: ['admin-config'],
    queryFn:  () => api.get('/config').then(r => r.data.data ?? []),
    staleTime: 30000,
  })

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put(`/config/${key}`, { value }),
    onSuccess: () => {
      toast.success('Saved!')
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['admin-config'] })
    },
    onError: () => toast.error('Failed to save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.delete(`/config/${key}`),
    onSuccess: () => {
      toast.success('Deleted')
      qc.invalidateQueries({ queryKey: ['admin-config'] })
    },
    onError: () => toast.error('Failed to delete'),
  })

  const addMutation = useMutation({
    mutationFn: () => api.put(`/config/${newKey.key}`, { value: newKey.value, description: newKey.description }),
    onSuccess: () => {
      toast.success('Added!')
      setShowAdd(false)
      setNewKey({ key: '', value: '', description: '' })
      qc.invalidateQueries({ queryKey: ['admin-config'] })
    },
    onError: () => toast.error('Failed to add'),
  })

  const categories = configs
    ? [...new Set(configs.map((c: any) => c.category as string))]
    : []

  const filtered = (configs ?? []).filter((c: any) =>
    !filter ||
    c.key.toLowerCase().includes(filter.toLowerCase()) ||
    c.label.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-dark-400">
          Changes apply immediately. Keys are loaded into the backend on startup.
        </p>
        <div className="flex gap-2">
          <input
            className="input text-sm w-44"
            placeholder="Search keys..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm flex items-center gap-1.5">
            <Plus size={13}/> Add Key
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card p-4 border-brand-200 dark:border-brand-500/30 space-y-3">
          <p className="font-medium text-sm text-dark-900 dark:text-white">Add custom environment key</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Key name (UPPERCASE_WITH_UNDERSCORES)</label>
              <input className="input" placeholder="MY_CUSTOM_KEY"
                value={newKey.key} onChange={e => setNewKey(f => ({ ...f, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,'') }))}/>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Value</label>
              <input className="input" placeholder="Value..." value={newKey.value} onChange={e => setNewKey(f => ({ ...f, value: e.target.value }))}/>
            </div>
            <div>
              <label className="text-xs text-dark-400 mb-1 block">Description</label>
              <input className="input" placeholder="What is this for?" value={newKey.description} onChange={e => setNewKey(f => ({ ...f, description: e.target.value }))}/>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => addMutation.mutate()}
              disabled={!newKey.key || !newKey.value || addMutation.isPending}
              className="btn-primary btn-sm"
            >
              <Save size={12}/> Save
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="card p-8 text-center text-dark-400">Loading configuration...</div>
      ) : (
        categories.map(cat => {
          const catItems = filtered.filter((c: any) => c.category === cat)
          if (catItems.length === 0) return null
          return (
            <div key={cat} className="card overflow-hidden">
              <div className="card-header bg-dark-50 dark:bg-dark-800/50">
                <span className="font-semibold text-sm">{cat}</span>
                <span className="text-xs text-dark-400">{catItems.length} key{catItems.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-dark-100 dark:divide-dark-800">
                {catItems.map((cfg: any) => (
                  <div key={cfg.key} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-sm text-dark-900 dark:text-white">{cfg.label}</span>
                          <code className="text-xs text-dark-400 bg-dark-100 dark:bg-dark-800 px-1.5 py-0.5 rounded">{cfg.key}</code>
                          {cfg.isSet
                            ? <span className="badge badge-green text-[10px]">Set</span>
                            : <span className="badge badge-gray text-[10px]">Not set</span>
                          }
                        </div>
                        <p className="text-xs text-dark-400 mb-2 leading-relaxed">{cfg.description}</p>
                        {cfg.howTo && (
                          <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 rounded-lg px-3 py-2 mb-2">
                            <div className="flex items-start gap-2">
                              <Info size={11} className="text-blue-500 shrink-0 mt-0.5"/>
                              <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">{cfg.howTo}</p>
                            </div>
                          </div>
                        )}
                        {editing === cfg.key ? (
                          <div className="flex gap-2 mt-2">
                            {cfg.key === 'ACTIVE_SWAP_WIDGET' ? (
                              <select
                                className="input text-sm flex-1"
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                autoFocus
                              >
                                <option value="oneinch">1inch (needs API key above)</option>
                                <option value="changenow">ChangeNOW (no API key — good fallback)</option>
                              </select>
                            ) : (
                            <input
                              className="input text-sm font-mono flex-1"
                              type={cfg.secret ? 'password' : 'text'}
                              placeholder={`Enter ${cfg.label}...`}
                              value={editVal}
                              onChange={e => setEditVal(e.target.value)}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveMutation.mutate({ key: cfg.key, value: editVal })
                                if (e.key === 'Escape') setEditing(null)
                              }}
                            />
                            )}
                            <button
                              onClick={() => saveMutation.mutate({ key: cfg.key, value: editVal })}
                              disabled={saveMutation.isPending}
                              className="btn-primary btn-sm"
                            >
                              <Save size={13}/>
                            </button>
                            <button onClick={() => setEditing(null)} className="btn-secondary btn-sm">✕</button>
                          </div>
                        ) : cfg.isSet ? (
                          <div className="flex items-center gap-2 mt-1">
                            <code className="text-xs font-mono text-dark-500 dark:text-dark-400 bg-dark-100 dark:bg-dark-800 px-2 py-0.5 rounded">
                              {cfg.secret && !showSecret[cfg.key] ? '••••••••' : cfg.rawValue}
                            </code>
                            {cfg.secret && (
                              <button
                                onClick={() => setShowSecret(s => ({ ...s, [cfg.key]: !s[cfg.key] }))}
                                className="text-xs text-dark-400 hover:text-dark-600 dark:hover:text-dark-200"
                              >
                                {showSecret[cfg.key] ? 'Hide' : 'Show'}
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditing(cfg.key); setEditVal(cfg.rawValue || '') }}
                          className="btn-ghost btn-sm p-2" title="Edit"
                        >
                          <Edit2 size={13}/>
                        </button>
                        {cfg.isSet && (
                          <button
                            onClick={() => deleteMutation.mutate(cfg.key)}
                            className="btn-ghost btn-sm p-2 text-red-400 hover:text-red-500"
                            title="Delete"
                          >
                            <Trash2 size={13}/>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Ad Preview ────────────────────────────────────────────────
// SINGLE declaration - no duplicates
function AdPreview({ ad }: { ad: any }) {
  if (!ad) return null

  if (ad.type === 'BANNER') {
    return (
      <div className="border border-dark-200 dark:border-dark-700 rounded-lg overflow-hidden">
        <div className="bg-dark-50 dark:bg-dark-800 px-3 py-1 text-xs text-dark-400 border-b border-dark-200 dark:border-dark-700">
          Preview — Banner Ad (desktop top bar)
        </div>
        <div className="h-16 bg-brand-50 dark:bg-brand-500/10 flex items-center justify-between px-6">
          <div>
            <p className="font-bold text-brand-600 dark:text-brand-400">{ad.title || 'Ad Title'}</p>
            <p className="text-xs text-dark-400">{ad.description || 'Ad description'}</p>
          </div>
          <span className="badge badge-blue">SPONSORED</span>
        </div>
      </div>
    )
  }

  if (ad.type === 'SPONSORED_LISTING') {
    return (
      <div className="border border-dark-200 dark:border-dark-700 rounded-lg overflow-hidden">
        <div className="bg-dark-50 dark:bg-dark-800 px-3 py-1 text-xs text-dark-400 border-b border-dark-200 dark:border-dark-700">
          Preview — Sponsored Market Row
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-100 dark:bg-brand-500/20 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-brand-500">AD</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm text-dark-900 dark:text-white">{ad.title || 'Token Name'}</p>
                <span className="badge badge-blue text-[10px]">SPONSORED</span>
              </div>
              <p className="text-xs text-dark-400">{ad.description || 'Token description'}</p>
            </div>
          </div>
          <button className="btn-primary btn-sm">Learn More</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-dark-50 dark:bg-dark-800 rounded-lg p-3 text-xs text-dark-400">
      No preview available for type: {ad.type?.replace(/_/g, ' ')}
    </div>
  )
}

// ── Main AdminPage ────────────────────────────────────────────
export default function AdminPage() {
  const qc = useQueryClient()
  const [tab, setTab]         = useState<AdminTab>('dashboard')
  const [previewAd, setPreviewAd] = useState<any>(null)

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn:  () => api.get('/admin/dashboard').then(r => r.data.data),
    staleTime: 30000,
    refetchInterval: 60000,
  })

  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn:  () => api.get('/admin/users?limit=30').then(r => r.data.data),
    enabled:  tab === 'users',
    staleTime: 30000,
  })

  const { data: listings } = useQuery<{ listings: any[] }>({
    queryKey: ['admin-listings'],
    queryFn:  () => api.get('/listings?status=PENDING&limit=30').then(r => r.data.data),
    enabled:  tab === 'listings',
    staleTime: 30000,
  })

  const { data: ads } = useQuery<any[]>({
    queryKey: ['admin-ads'],
    queryFn:  () => api.get('/advertisements/all-admin').then(r => r.data.data ?? []),
    enabled:  tab === 'ads',
    staleTime: 30000,
  })

  const { data: withdrawals } = useQuery<any[]>({
    queryKey: ['admin-withdrawals'],
    queryFn:  () => api.get('/admin/withdrawals').then(r => r.data.data ?? []),
    enabled:  tab === 'withdrawals',
    staleTime: 30000,
  })

  const reviewListing = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/listings/${id}/review`, { status }),
    onSuccess: () => {
      toast.success('Listing updated')
      qc.invalidateQueries({ queryKey: ['admin-listings'] })
    },
    onError: () => toast.error('Failed to update listing'),
  })

  const reviewAd = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/advertisements/${id}/review`, { status }),
    onSuccess: () => {
      toast.success('Ad updated')
      qc.invalidateQueries({ queryKey: ['admin-ads'] })
    },
    onError: () => toast.error('Failed to update ad'),
  })

  const processWithdrawal = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/admin/withdrawals/${id}`, { status }),
    onSuccess: () => {
      toast.success('Withdrawal processed')
      qc.invalidateQueries({ queryKey: ['admin-withdrawals'] })
    },
    onError: () => toast.error('Failed to process withdrawal'),
  })

  const updateUser = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/admin/users/${id}`, { status }),
    onSuccess: () => {
      toast.success('User updated')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: () => toast.error('Failed to update user'),
  })

  const TABS = [
    { key: 'dashboard'   as AdminTab, label: 'Dashboard',    icon: BarChart2   },
    { key: 'revenue'     as AdminTab, label: 'Revenue',       icon: DollarSign  },
    { key: 'users'       as AdminTab, label: 'Users',         icon: Users       },
    { key: 'listings'    as AdminTab, label: 'Listings',      icon: Layers      },
    { key: 'ads'         as AdminTab, label: 'Ads',           icon: BarChart2   },
    { key: 'withdrawals' as AdminTab, label: 'Withdrawals',   icon: CheckCircle },
    { key: 'config'      as AdminTab, label: 'Config & Keys', icon: Settings    },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-2xl font-bold text-dark-900 dark:text-white flex items-center gap-2">
        <ShieldCheck size={22} className="text-purple-500"/> Admin Panel
      </h1>

      {/* Tabs */}
      <div className="flex border-b border-dark-100 dark:border-dark-800 overflow-x-auto no-scrollbar">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-1.5 whitespace-nowrap', tab === key ? 'tab-active' : 'tab')}>
            <Icon size={13}/> {label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Users',          val: stats?.users?.total,      color: 'text-brand-500'   },
            { label: '24h Trades',           val: stats?.trading?.trades24h, color: 'text-emerald-500' },
            { label: 'Pending Listings',     val: stats?.listings?.pending,  color: 'text-purple-500'  },
            { label: 'Pending Withdrawals',  val: stats?.withdrawals?.pending,color:'text-orange-500' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <span className="stat-label">{s.label}</span>
              <span className={cn('stat-value', s.color)}>{s.val ?? '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Revenue */}
      {tab === 'revenue' && <RoutingStatus/>}

      {/* Users */}
      {tab === 'users' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dark-50 dark:bg-dark-800/50">
              <tr className="border-b border-dark-100 dark:border-dark-800">
                {['User','Role','KYC','Status','Joined','Action'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs text-dark-400 font-medium uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(usersData?.users ?? []).map((u: any) => (
                <tr key={u.id} className="border-b border-dark-100 dark:border-dark-800 hover:bg-dark-50 dark:hover:bg-dark-800/30">
                  <td className="px-5 py-3">
                    <p className="font-medium text-dark-900 dark:text-white">{u.username}</p>
                    <p className="text-xs text-dark-400">{u.email}</p>
                  </td>
                  <td className="px-5 py-3"><span className="badge badge-blue">{u.role}</span></td>
                  <td className="px-5 py-3"><span className={cn('badge', u.kycStatus === 'APPROVED' ? 'badge-green' : 'badge-gray')}>{u.kycStatus}</span></td>
                  <td className="px-5 py-3"><span className={cn('badge', u.status === 'ACTIVE' ? 'badge-green' : u.status === 'BANNED' ? 'badge-red' : 'badge-yellow')}>{u.status}</span></td>
                  <td className="px-5 py-3 text-xs text-dark-400">{fmt.date(u.createdAt)}</td>
                  <td className="px-5 py-3">
                    <select
                      value={u.status}
                      onChange={e => updateUser.mutate({ id: u.id, status: e.target.value })}
                      className="input text-xs py-1 w-28"
                    >
                      {['ACTIVE','SUSPENDED','BANNED'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Listings */}
      {tab === 'listings' && (
        <div className="space-y-4">
          {(listings?.listings ?? []).length === 0 && (
            <div className="card p-8 text-center text-dark-400">No pending listing applications</div>
          )}
          {(listings?.listings ?? []).map((l: any) => (
            <div key={l.id} className="card p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-bold text-lg text-dark-900 dark:text-white">{l.tokenSymbol}</span>
                    <span className="badge badge-blue">{l.blockchain}</span>
                    <span className={cn('badge', l.status === 'PENDING' ? 'badge-yellow' : l.status === 'LIVE' ? 'badge-green' : 'badge-red')}>
                      {l.status}
                    </span>
                  </div>
                  <p className="text-sm text-dark-500">{l.projectName} · by {l.user?.username}</p>
                </div>
                {l.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button onClick={() => reviewListing.mutate({ id: l.id, status: 'LIVE' })} className="btn-success btn-sm">
                      <CheckCircle size={13}/> Approve
                    </button>
                    <button onClick={() => reviewListing.mutate({ id: l.id, status: 'REJECTED' })} className="btn-danger btn-sm">
                      <XCircle size={13}/> Reject
                    </button>
                  </div>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm mb-4">
                <div className="space-y-1.5">
                  {[['Symbol', l.tokenSymbol], ['Name', l.tokenName], ['Supply', l.totalSupply]].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-dark-400">{k}</span>
                      <span className="font-mono text-dark-900 dark:text-white text-xs">{v || '—'}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {[['Website', l.website], ['Whitepaper', l.whitepaper], ['GitHub', l.github]].map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center">
                      <span className="text-dark-400">{k}</span>
                      {v?.startsWith?.('http') ? (
                        <a href={v} target="_blank" rel="noopener noreferrer" className="text-brand-500 text-xs flex items-center gap-1">
                          {k} <ExternalLink size={10}/>
                        </a>
                      ) : (
                        <span className="text-dark-400 text-xs">{v || '—'}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {l.description && (
                <p className="text-xs text-dark-400 line-clamp-2 bg-dark-50 dark:bg-dark-800/50 rounded p-3">{l.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ads */}
      {tab === 'ads' && (
        <div className="space-y-4">
          {(ads ?? []).length === 0 && (
            <div className="card p-8 text-center text-dark-400">No advertisements found</div>
          )}
          {(ads ?? []).map((ad: any) => (
            <div key={ad.id} className="card p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-dark-900 dark:text-white">{ad.title}</span>
                    <span className="badge badge-blue">{ad.type?.replace(/_/g,' ')}</span>
                    <span className={cn('badge',
                      ad.status === 'ACTIVE' ? 'badge-green' :
                      ad.status === 'PENDING_REVIEW' ? 'badge-yellow' : 'badge-red'
                    )}>
                      {ad.status?.replace(/_/g,' ')}
                    </span>
                  </div>
                  <p className="text-xs text-dark-400">Budget: ${fmt.qty(ad.budget, 2)} · {ad.user?.username}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setPreviewAd(previewAd?.id === ad.id ? null : ad)} className="btn-secondary btn-sm">
                    <Eye size={13}/> {previewAd?.id === ad.id ? 'Hide' : 'Preview'}
                  </button>
                  {ad.status === 'PENDING_REVIEW' && (
                    <>
                      <button onClick={() => reviewAd.mutate({ id: ad.id, status: 'ACTIVE' })} className="btn-success btn-sm">
                        <CheckCircle size={13}/> Approve
                      </button>
                      <button onClick={() => reviewAd.mutate({ id: ad.id, status: 'REJECTED' })} className="btn-danger btn-sm">
                        <XCircle size={13}/> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
              {previewAd?.id === ad.id && (
                <div className="mt-3 animate-slide-up">
                  <p className="text-xs text-dark-400 mb-2 font-medium">Live preview — how users will see this:</p>
                  <AdPreview ad={ad}/>
                </div>
              )}
              <div className="flex gap-5 mt-3 text-xs text-dark-400">
                <span>Impressions: <strong className="text-dark-900 dark:text-white">{(ad.impressions || 0).toLocaleString()}</strong></span>
                <span>Clicks: <strong className="text-dark-900 dark:text-white">{(ad.clicks || 0).toLocaleString()}</strong></span>
                <span>Spent: <strong className="text-dark-900 dark:text-white">${fmt.qty(ad.spent, 2)}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Withdrawals */}
      {tab === 'withdrawals' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dark-50 dark:bg-dark-800/50">
              <tr className="border-b border-dark-100 dark:border-dark-800">
                {['User','Asset','Amount','Address','Date','Action'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs text-dark-400 font-medium uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(withdrawals ?? []).length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-dark-400">No pending withdrawals</td></tr>
              ) : (withdrawals ?? []).map((w: any) => (
                <tr key={w.id} className="border-b border-dark-100 dark:border-dark-800 hover:bg-dark-50 dark:hover:bg-dark-800/30">
                  <td className="px-5 py-3 text-xs text-dark-400">{w.user?.username}</td>
                  <td className="px-5 py-3 font-mono font-medium text-dark-900 dark:text-white">{w.asset}</td>
                  <td className="px-5 py-3 font-mono text-dark-900 dark:text-white">{fmt.qty(w.amount)}</td>
                  <td className="px-5 py-3 font-mono text-xs text-dark-400">{fmt.addr(w.address)}</td>
                  <td className="px-5 py-3 text-xs text-dark-400">{fmt.datetime(w.createdAt)}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => processWithdrawal.mutate({ id: w.id, status: 'COMPLETED' })} className="btn-success btn-sm">
                        <CheckCircle size={12}/> Approve
                      </button>
                      <button onClick={() => processWithdrawal.mutate({ id: w.id, status: 'FAILED' })} className="btn-danger btn-sm">
                        <XCircle size={12}/> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Config */}
      {tab === 'config' && <ConfigManager/>}
    </div>
  )
}
