import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import TickerBar from './TickerBar'
import DemoBanner from '@/components/ui/DemoBanner'

export default function Layout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-dark-950">
      {/* Demo warning banner - zero height on live */}
      <DemoBanner />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Topbar />
          <TickerBar />
          <main className="flex-1 overflow-y-auto p-5 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
