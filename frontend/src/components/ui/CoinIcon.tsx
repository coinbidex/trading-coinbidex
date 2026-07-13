import { useState } from 'react'
import { coinMeta, iconUrl } from '@/utils/coins'

interface CoinIconProps {
  symbol: string          // pair or base symbol, e.g. "BTCUSDT" or "BTC"
  size?: number
  className?: string
  src?: string            // optional explicit logo URL (e.g. from backend asset record)
}

// Renders a real coin logo (not a generic line icon). If the primary source
// 404s, falls back to a second CDN, then finally to a crisp brand-colored
// initial badge so the UI never shows a broken image.
export default function CoinIcon({ symbol, size = 28, className = '', src }: CoinIconProps) {
  const meta = coinMeta(symbol)
  const primary = src && src.length > 0 ? src : iconUrl(symbol)
  const secondary = `https://assets.coincap.io/assets/icons/${meta.symbol.toLowerCase()}@2x.png`

  const [stage, setStage] = useState<'primary' | 'secondary' | 'fallback'>('primary')

  if (stage === 'fallback') {
    return (
      <div
        className={`flex items-center justify-center rounded-full font-bold text-white shrink-0 ${className}`}
        style={{ width: size, height: size, background: meta.color, fontSize: size * 0.4 }}
      >
        {meta.symbol.slice(0, 1)}
      </div>
    )
  }

  return (
    <img
      src={stage === 'primary' ? primary : secondary}
      alt={meta.symbol}
      width={size}
      height={size}
      className={`rounded-full object-contain bg-white/5 shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setStage(s => (s === 'primary' ? 'secondary' : 'fallback'))}
    />
  )
}
