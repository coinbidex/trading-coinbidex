// ListingPage.tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, CheckCircle, Clock, XCircle } from 'lucide-react'
import api from '@/utils/api'
import { fmt } from '@/utils/format'
import toast from 'react-hot-toast'

export default function ListingPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    projectName: '', tokenSymbol: '', tokenName: '', description: '',
    website: '', whitepaper: '', github: '', twitter: '', telegram: '',
    totalSupply: '', blockchain: 'Ethereum', contractAddress: ''
  })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) =>
    setForm(f => ({...f, [k]: e.target.value}))

  const { data: myListings } = useQuery({
    queryKey: ['my-listings'],
    queryFn: () => api.get('/listings/mine').then(r => r.data.data),
  })

  const mutation = useMutation({
    mutationFn: () => api.post('/listings', form),
    onSuccess: () => {
      toast.success('Application submitted! Review takes 3-5 business days.')
      setForm({ projectName:'',tokenSymbol:'',tokenName:'',description:'',website:'',whitepaper:'',github:'',twitter:'',telegram:'',totalSupply:'',blockchain:'Ethereum',contractAddress:'' })
      qc.invalidateQueries({ queryKey: ['my-listings'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Submission failed'),
  })

  const statusIcon = (s: string) => s === 'LIVE' ? <CheckCircle size={14} className="text-emerald-400"/> : s === 'REJECTED' ? <XCircle size={14} className="text-red-400"/> : <Clock size={14} className="text-yellow-400"/>

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Layers size={22} className="text-brand-400"/> List Your Token</h1>
        <p className="text-dark-400 text-sm mt-1">Apply to have your token listed on Cryptex. Review takes 3–5 business days.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[{label:'Listing Fee',val:'0.1 BTC'},{label:'Review Time',val:'3-5 days'},{label:'Listed Projects',val:'150+'}].map(s=>(
          <div key={s.label} className="stat-card"><span className="stat-label">{s.label}</span><span className="stat-value text-brand-400">{s.val}</span></div>
        ))}
      </div>

      {myListings && myListings.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="font-semibold text-sm">Your Applications</span></div>
          {myListings.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between px-5 py-3 border-b border-dark-800 last:border-0">
              <div className="flex items-center gap-2">{statusIcon(l.status)}<span className="font-medium text-white">{l.tokenSymbol}</span><span className="text-dark-400 text-sm">{l.projectName}</span></div>
              <span className={`badge ${l.status==='LIVE'?'badge-green':l.status==='REJECTED'?'badge-red':'badge-yellow'}`}>{l.status}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header"><span className="font-semibold">Application Form</span></div>
        <div className="card-body space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            {[['projectName','Project Name'],['tokenSymbol','Token Symbol (max 10)'],['tokenName','Token Full Name'],['website','Website URL']].map(([k,l])=>(
              <div key={k}><label className="text-xs text-dark-300 mb-1.5 block">{l}</label><input className="input" value={(form as any)[k]} onChange={set(k)} required/></div>
            ))}
          </div>
          <div><label className="text-xs text-dark-300 mb-1.5 block">Description (min 100 chars)</label>
            <textarea className="input min-h-24 resize-none" value={form.description} onChange={set('description')} placeholder="Describe your project, use case, and technology..."/>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {[['totalSupply','Total Supply'],['blockchain','Blockchain'],['contractAddress','Contract Address'],['whitepaper','Whitepaper URL']].map(([k,l])=>(
              <div key={k}><label className="text-xs text-dark-300 mb-1.5 block">{l}</label><input className="input" value={(form as any)[k]} onChange={set(k)}/></div>
            ))}
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[['github','GitHub'],['twitter','Twitter'],['telegram','Telegram']].map(([k,l])=>(
              <div key={k}><label className="text-xs text-dark-300 mb-1.5 block">{l}</label><input className="input" value={(form as any)[k]} onChange={set(k)}/></div>
            ))}
          </div>
          <div className="bg-dark-800/50 rounded-lg p-4 text-xs text-dark-400">
            By submitting, you agree to pay the listing fee of <span className="text-white font-medium">0.1 BTC</span> upon approval. All submitted information must be accurate.
          </div>
          <button onClick={()=>mutation.mutate()} disabled={mutation.isPending || !form.projectName || !form.tokenSymbol || !form.description} className="btn-primary">
            {mutation.isPending ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      </div>
    </div>
  )
}
