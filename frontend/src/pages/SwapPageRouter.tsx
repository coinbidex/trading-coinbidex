import { useEffect, useState } from 'react'
import api from '@/utils/api'
import SwapPage from './SwapPage'
import OneInchSwapWidget from '@/components/swap/OneInchSwapWidget'

interface PublicSwapConfig {
  swapWidgetProvider: 'internal' | '1inch_embed'
  swapReferrerAddress: string
  swapReferrerFeePct: number
}

// Reads the admin-chosen swap provider (Admin Settings → Swap Widget) and
// renders the matching implementation. Defaults to the internal widget if
// the config fetch fails, so a backend hiccup never leaves /swap blank.
export default function SwapPageRouter() {
  const [config, setConfig] = useState<PublicSwapConfig | null>(null)

  useEffect(() => {
    api.get('/public-config')
      .then(res => setConfig(res.data.data))
      .catch(() => setConfig({ swapWidgetProvider: 'internal', swapReferrerAddress: '', swapReferrerFeePct: 0 }))
  }, [])

  if (!config) {
    return <div className="flex justify-center py-24 text-white/40">Loading swap…</div>
  }

  if (config.swapWidgetProvider === '1inch_embed') {
    return (
      <OneInchSwapWidget
        referrerAddress={config.swapReferrerAddress}
        referrerFeePct={config.swapReferrerFeePct}
      />
    )
  }

  return <SwapPage />
}
