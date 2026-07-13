import { useEffect, useRef, useState } from 'react'
import { COINGECKO_IDS, baseSymbol } from '@/utils/coins'

export interface LivePrice {
  price: number
  changePct: number
  high24h?: number
  low24h?: number
  volume24h?: number
}

const ALL_IDS = Array.from(new Set(Object.values(COINGECKO_IDS))).join(',')
const ID_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(COINGECKO_IDS).map(([sym, id]) => [id, sym])
)

let cache: Record<string, LivePrice> = {}
let lastFetch = 0
let inflight: Promise<Record<string, LivePrice>> | null = null

async function fetchLivePrices(): Promise<Record<string, LivePrice>> {
  const now = Date.now()
  if (now - lastFetch < 15000 && Object.keys(cache).length) return cache
  if (inflight) return inflight

  inflight = fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ALL_IDS}&price_change_percentage=24h`
  )
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('coingecko error'))))
    .then((rows: any[]) => {
      const next: Record<string, LivePrice> = {}
      for (const row of rows) {
        const sym = ID_TO_SYMBOL[row.id]
        if (!sym) continue
        next[sym] = {
          price: row.current_price ?? 0,
          changePct: row.price_change_percentage_24h ?? 0,
          high24h: row.high_24h ?? 0,
          low24h: row.low_24h ?? 0,
          volume24h: row.total_volume ?? 0,
        }
      }
      cache = next
      lastFetch = Date.now()
      return cache
    })
    .catch(() => cache)
    .finally(() => { inflight = null })

  return inflight
}

/**
 * Live market price fallback. The platform's own backend/websocket may be
 * offline in this environment (that's why the ticker/markets pages showed
 * zero for every asset) — this hook pulls real, current prices for every
 * listed coin from CoinGecko's public API and refreshes on an interval, so
 * price data is always real rather than "$0.00".
 */
export function useLivePrices(refreshMs = 30000) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>(cache)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    let timer: ReturnType<typeof setInterval>

    const load = async () => {
      const data = await fetchLivePrices()
      if (mounted.current) setPrices({ ...data })
    }

    load()
    timer = setInterval(load, refreshMs)

    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [refreshMs])

  const get = (pairOrSymbol: string): LivePrice | undefined => prices[baseSymbol(pairOrSymbol)]

  return { prices, get }
}
