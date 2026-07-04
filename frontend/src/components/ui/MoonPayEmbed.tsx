import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader } from 'lucide-react'
import api from '@/utils/api'

interface MoonPayEmbedProps {
  symbol: string
  onClose?: () => void
}

const CURRENCY_MAP: Record<string, string> = {
  BTC:   'btc',
  ETH:   'eth',
  USDT:  'usdt_erc20',
  BNB:   'bnb',
  SOL:   'sol',
  MATIC: 'matic',
  ADA:   'ada',
  DOGE:  'doge',
  USDC:  'usdc',
  LINK:  'link',
}

export default function MoonPayEmbed({ symbol }: MoonPayEmbedProps) {
  const mpCurrency = CURRENCY_MAP[symbol] || 'eth'

  const { data, isLoading } = useQuery({
    queryKey: ['moonpay-url', mpCurrency],
    queryFn: () => api.get(`/moonpay/url?currency=${mpCurrency}&fiat=usd`).then(r => r.data.data),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader size={20} className="animate-spin text-brand-400"/>
      </div>
    )
  }

  if (!data?.url) return null

  // Show the widget — in test mode just open in new tab since iframe may be blocked
  // In production with a real pk_live_ key the iframe works perfectly
  return (
    <div className="space-y-3">
      {!data.configured ? (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300">
          <p className="font-medium mb-1">Test mode</p>
          <p className="text-xs text-yellow-400/80 mb-3">
            Add your MoonPay keys to go live. Get them at{' '}
            <a href="https://www.moonpay.com/business/partners" target="_blank" className="underline">
              moonpay.com/business/partners
            </a>
          </p>
          <p className="text-xs text-yellow-400/80">
            Partner note: You earn <span className="text-yellow-300 font-medium">0.5–1%</span> on every purchase made through your link.
          </p>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300">
          Secured by MoonPay · Card, bank transfer and 30+ payment methods accepted
        </div>
      )}

      {/* Try to embed iframe first; fallback to button */}
      <div className="rounded-xl overflow-hidden border border-dark-700" style={{ height: '480px' }}>
        <iframe
          src={data.url}
          width="100%"
          height="100%"
          style={{ border: 'none', background: '#0f172a' }}
          allow="accelerometer; autoplay; camera; gyroscope; payment"
          title="Buy crypto with MoonPay"
        />
      </div>

      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl text-sm text-dark-300 hover:text-white transition-colors"
      >
        <ExternalLink size={14}/> Open in new tab
      </a>
    </div>
  )
}
