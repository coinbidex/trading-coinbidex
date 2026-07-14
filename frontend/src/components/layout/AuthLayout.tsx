import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import Logo from '@/components/ui/Logo'

export default function AuthLayout() {
  const { isAuthenticated } = useAuthStore()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-dark-50 flex flex-col items-center justify-center p-6">
      <Logo size="md" variant="full" className="mb-8" />
      <div className="w-full max-w-[400px] bg-white rounded-2xl border border-dark-100 shadow-sm p-8">
        <Outlet />
      </div>
      <p className="text-center text-xs text-dark-300 mt-8">
        © {new Date().getFullYear()} Coinbidex. All rights reserved.
      </p>
    </div>
  )
}
