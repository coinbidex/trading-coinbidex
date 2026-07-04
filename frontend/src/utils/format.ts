// Safe number parser - never throws, always returns a number
function toNum(n: unknown): number {
  if (n === null || n === undefined || n === '') return 0
  const parsed = typeof n === 'string' ? parseFloat(n) : Number(n)
  return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed
}

export const fmt = {
  // Price with auto decimal precision
  price(n: unknown): string {
    const num = toNum(n)
    if (num === 0) return '0.00'
    if (num >= 1000)  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (num >= 1)     return num.toFixed(2)
    if (num >= 0.01)  return num.toFixed(4)
    if (num >= 0.0001)return num.toFixed(6)
    return num.toFixed(8)
  },

  // Volume in $B/$M/$K
  volume(n: unknown): string {
    const num = toNum(n)
    if (num === 0) return '$0'
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  },

  // Percentage with sign
  pct(n: unknown): string {
    const num = toNum(n)
    const sign = num >= 0 ? '+' : ''
    return `${sign}${num.toFixed(2)}%`
  },

  // Quantity — strips trailing zeros
  qty(n: unknown, decimals = 6): string {
    const num = toNum(n)
    if (num === 0) return '0'
    const fixed = num.toFixed(decimals)
    return fixed.replace(/\.?0+$/, '')
  },

  // USD currency
  usd(n: unknown): string {
    const num = toNum(n)
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
  },

  // Date only
  date(d: unknown): string {
    if (!d) return '—'
    try {
      return new Date(d as string).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      })
    } catch { return '—' }
  },

  // Date + time
  datetime(d: unknown): string {
    if (!d) return '—'
    try {
      return new Date(d as string).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    } catch { return '—' }
  },

  // Time ago
  timeAgo(d: unknown): string {
    if (!d) return '—'
    try {
      const diff = Date.now() - new Date(d as string).getTime()
      if (diff < 0) return 'just now'
      const secs = Math.floor(diff / 1000)
      if (secs < 60)  return `${secs}s ago`
      const mins = Math.floor(secs / 60)
      if (mins < 60)  return `${mins}m ago`
      const hrs  = Math.floor(mins / 60)
      if (hrs < 24)   return `${hrs}h ago`
      return `${Math.floor(hrs / 24)}d ago`
    } catch { return '—' }
  },

  // Wallet address short form
  addr(addr: unknown): string {
    if (!addr || typeof addr !== 'string' || addr.length < 10) return '—'
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  },
}

// Tailwind color class based on positive/negative
export function colorClass(n: unknown): string {
  const num = toNum(n)
  if (num > 0) return 'text-emerald-500 dark:text-emerald-400'
  if (num < 0) return 'text-red-500 dark:text-red-400'
  return 'text-dark-400'
}

// Classname combiner
export function cn(...classes: (string | undefined | null | false | 0)[]): string {
  return classes.filter(Boolean).join(' ')
}
