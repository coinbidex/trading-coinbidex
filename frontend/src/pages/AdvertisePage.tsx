import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, BarChart2, MousePointer, Eye } from 'lucide-react'
import api from '@/utils/api'
import { fmt } from '@/utils/format'
import toast from 'react-hot-toast'

interface AdForm {
  type:        string
  title:       string
  description: string
  targetUrl:   string
  budget:      string
  startDate:   string
  endDate:     string
}

export default function AdvertisePage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<AdForm>({
    type: 'BANNER', title: '', description: '',
    targetUrl: '', budget: '', startDate: '', endDate: '',
  })

  const set = (k: keyof AdForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const { data: pricing } = useQuery({
    queryKey: ['ad-pricing'],
    queryFn:  () => api.get('/advertisements/pricing').then(r => r.data.data),
    staleTime: 300000,
  })

  const { data: myAds } = useQuery({
    queryKey: ['my-ads'],
    queryFn:  () => api.get('/advertisements/mine').then(r => r.data.data ?? []),
    staleTime: 30000,
  })

  const mutation = useMutation({
    mutationFn: () => api.post('/advertisements', {
      ...form,
      budget: parseFloat(form.budget),
    }),
    onSuccess: () => {
      toast.success('Campaign submitted for review!')
      setForm({ type: 'BANNER', title: '', description: '', targetUrl: '', budget: '', startDate: '', endDate: '' })
      qc.invalidateQueries({ queryKey: ['my-ads'] })
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || 'Submission failed')
    },
  })

  const AD_TYPES = ['BANNER', 'SPONSORED_LISTING', 'PUSH_NOTIFICATION', 'EMAIL_BLAST']

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-dark-900 dark:text-white flex items-center gap-2">
          <Megaphone size={22} className="text-brand-500"/> Advertise
        </h1>
        <p className="text-dark-400 text-sm mt-1">Reach 500,000+ active crypto traders on Coinbidex.</p>
      </div>

      {/* Packages */}
      {pricing?.packages && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pricing.packages.map((p: any) => (
            <div
              key={p.type}
              onClick={() => setForm(f => ({ ...f, type: p.type }))}
              className={`card p-4 cursor-pointer transition-all ${
                form.type === p.type
                  ? 'border-brand-500/50 bg-brand-50 dark:bg-brand-500/5'
                  : 'hover:border-dark-300 dark:hover:border-dark-600'
              }`}
            >
              <p className="font-semibold text-dark-900 dark:text-white text-sm">{p.name}</p>
              <p className="text-xs text-dark-400 mt-1 mb-3">{p.description}</p>
              <p className="text-brand-500 font-mono font-bold">
                {p.cpc ? `$${p.cpc}/click` : `$${p.cpm}/1K views`}
              </p>
              <p className="text-xs text-dark-400 mt-1">Min. ${p.minBudget} budget</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <span className="font-semibold text-dark-900 dark:text-white">Create Campaign</span>
          </div>
          <div className="card-body space-y-4">
            <div>
              <label className="text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5 block">Ad Type</label>
              <select value={form.type} onChange={set('type')} className="input">
                {AD_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5 block">Title</label>
              <input className="input" value={form.title} onChange={set('title')} placeholder="e.g. Trade XYZ on Coinbidex"/>
            </div>
            <div>
              <label className="text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5 block">Description</label>
              <textarea className="input resize-none h-20" value={form.description} onChange={set('description')} placeholder="Your ad copy..."/>
            </div>
            <div>
              <label className="text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5 block">Target URL</label>
              <input className="input" type="url" value={form.targetUrl} onChange={set('targetUrl')} placeholder="https://yoursite.com"/>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5 block">Budget (USD)</label>
                <input className="input" type="number" min="0" value={form.budget} onChange={set('budget')} placeholder="500"/>
              </div>
              <div>
                <label className="text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5 block">Start Date</label>
                <input className="input" type="date" value={form.startDate} onChange={set('startDate')}/>
              </div>
              <div>
                <label className="text-xs font-medium text-dark-500 dark:text-dark-300 mb-1.5 block">End Date</label>
                <input className="input" type="date" value={form.endDate} onChange={set('endDate')}/>
              </div>
            </div>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !form.title || !form.budget}
              className="btn-primary"
            >
              {mutation.isPending ? 'Submitting...' : 'Submit Campaign'}
            </button>
          </div>
        </div>

        {/* Stats sidebar */}
        <div className="space-y-4">
          <div className="card p-4">
            <p className="text-xs text-dark-400 mb-3 font-medium uppercase tracking-wide">Platform Reach</p>
            {[
              { icon: Eye,          label: 'Monthly Views',  val: '12M+' },
              { icon: MousePointer, label: 'Avg CTR',         val: '2.4%' },
              { icon: BarChart2,    label: 'Active Traders',  val: '500K+' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 py-2 border-b border-dark-100 dark:border-dark-800 last:border-0">
                <s.icon size={14} className="text-brand-500"/>
                <span className="text-sm text-dark-500 dark:text-dark-300">{s.label}</span>
                <span className="ml-auto font-mono font-medium text-dark-900 dark:text-white">{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* My campaigns */}
      {Array.isArray(myAds) && myAds.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="font-semibold text-sm text-dark-900 dark:text-white">Your Campaigns</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-100 dark:border-dark-800">
                  {['Title','Type','Status','Impressions','Clicks','Spent','Start'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs text-dark-400 font-medium uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myAds.map((ad: any) => (
                  <tr key={ad.id} className="border-b border-dark-100 dark:border-dark-800 hover:bg-dark-50 dark:hover:bg-dark-800/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-dark-900 dark:text-white">{ad.title}</td>
                    <td className="px-5 py-3 text-xs text-dark-400">{String(ad.type).replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3">
                      <span className={`badge ${ad.status === 'ACTIVE' ? 'badge-green' : ad.status === 'REJECTED' ? 'badge-red' : 'badge-yellow'}`}>
                        {String(ad.status).replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-dark-600 dark:text-dark-300">{(ad.impressions ?? 0).toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono text-dark-600 dark:text-dark-300">{(ad.clicks ?? 0).toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono text-dark-900 dark:text-white">${fmt.qty(ad.spent, 2)}</td>
                    <td className="px-5 py-3 text-xs text-dark-400">{fmt.date(ad.startDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
