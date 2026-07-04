import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import Layout       from '@/components/layout/Layout'
import AuthLayout   from '@/components/layout/AuthLayout'
import Dashboard    from '@/pages/Dashboard'
import TradingPage  from '@/pages/TradingPage'
import SwapPage     from '@/pages/SwapPage'
import MarketsPage  from '@/pages/MarketsPage'
import WalletPage   from '@/pages/WalletPage'
import OrdersPage   from '@/pages/OrdersPage'
import ListingPage  from '@/pages/ListingPage'
import AdvertisePage from '@/pages/AdvertisePage'
import ProfilePage  from '@/pages/ProfilePage'
import AdminPage    from '@/pages/AdminPage'
import LoginPage    from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import LandingPage  from '@/pages/LandingPage'
import VerifyEmailPage from '@/pages/VerifyEmailPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/"              element={<LandingPage />} />
      <Route path="/verify-email"  element={<VerifyEmailPage />} />

      <Route element={<AuthLayout />}>
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard"     element={<Dashboard />} />
        <Route path="/trade"         element={<TradingPage />} />
        <Route path="/trade/:symbol" element={<TradingPage />} />
        <Route path="/swap"          element={<SwapPage />} />
        <Route path="/markets"       element={<MarketsPage />} />
        <Route path="/wallet"        element={<WalletPage />} />
        <Route path="/orders"        element={<OrdersPage />} />
        <Route path="/listing"       element={<ListingPage />} />
        <Route path="/advertise"     element={<AdvertisePage />} />
        <Route path="/profile"       element={<ProfilePage />} />
      </Route>

      <Route element={<AdminOnly><Layout /></AdminOnly>}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
