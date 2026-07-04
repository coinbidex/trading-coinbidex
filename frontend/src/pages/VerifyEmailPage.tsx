import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Loader } from 'lucide-react'
import api from '@/utils/api'
import Logo from '@/components/ui/Logo'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'loading'|'success'|'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); setMessage('No verification token found.'); return }

    api.get(`/auth/verify-email?token=${token}`)
      .then(r => {
        setStatus('success')
        setMessage(r.data.message)

        setTimeout(() => {
          window.location.href = '/login'
        }, 2500)
      })
      .catch(e => { setStatus('error'); setMessage(e.response?.data?.message || 'Verification failed') })
  }, [])

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center p-6">
      <Logo size="lg" variant="full" className="mb-12"/>
      <div className="card w-full max-w-md p-8 text-center">
        {status === 'loading' && (
          <><Loader size={40} className="text-brand-500 animate-spin mx-auto mb-4"/>
          <p className="text-dark-500 dark:text-dark-300">Verifying your email...</p></>
        )}
        {status === 'success' && (
          <><CheckCircle size={48} className="text-emerald-400 mx-auto mb-4"/>
          <h2 className="text-xl font-bold text-dark-900 dark:text-white mb-2">Email verified!</h2>
          <p className="text-dark-500 dark:text-dark-400 mb-6">{message}</p>
          <Link to="/login" className="btn-primary w-full justify-center">Sign in to Coinbidex</Link></>
        )}
        {status === 'error' && (
          <><XCircle size={48} className="text-red-400 mx-auto mb-4"/>
          <h2 className="text-xl font-bold text-dark-900 dark:text-white mb-2">Verification failed</h2>
          <p className="text-dark-500 dark:text-dark-400 mb-6">{message}</p>
          <Link to="/register" className="btn-secondary w-full justify-center">Back to register</Link></>
        )}
      </div>
    </div>
  )
}
