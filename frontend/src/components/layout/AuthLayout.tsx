import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'

export default function AuthLayout() {
  const { isAuthenticated } = useAuthStore()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-white dark:bg-dark-950 flex items-center justify-center">
      
      <div className="w-full lg:w-[480px] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-dark-100 dark:border-dark-800 lg:hidden">
          <ThemeToggle />
        </div>

        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="flex justify-center mb-6">
              <Logo size="md" variant="full" />
            </div>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}
