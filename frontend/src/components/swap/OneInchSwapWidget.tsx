import { useEffect, useRef } from 'react'
import { setup1inchWidget } from '@1inch/embedded-widget'
import { useChainId } from 'wagmi'
import { AlertTriangle } from 'lucide-react'

interface Props {
  referrerAddress?: string
  referrerFeePct?: number
}

/**
 * Non-custodial swap via 1inch's embedded widget — executes directly from
 * the visitor's own connected wallet (MetaMask etc). No liquidity, no
 * Binance/broker keys, no backend routing needed on our side at all, which
 * is exactly what makes this viable while getting proper Swap API access
 * (KYB-gated as of 2026) is still in progress.
 *
 * HONESTY NOTE for whoever maintains this: `setup1inchWidget`'s documented
 * options (chainId, sourceTokenSymbol, destinationTokenSymbol, hostElement,
 * provider, theme, sourceTokenAmount) do NOT include a confirmed referrer-fee
 * parameter as of the last time this was checked against the package's own
 * docs. The referrerAddress/fee mechanism IS real and documented for 1inch's
 * raw Swap API, but whether *this specific pre-built widget* exposes it is
 * unverified — check https://github.com/1inch/embedded-widget's current
 * README before assuming revenue is actually flowing. If it isn't exposed,
 * the realistic paths are: (a) ask 1inch support directly, (b) use their
 * raw Swap API with referrerAddress/fee once KYB is approved, or (c) accept
 * this widget as a user-acquisition/traffic tool now and add the fee once
 * (b) is possible. Don't quietly assume money is being collected here.
 *
 * Also worth knowing: this package has very low adoption and hasn't been
 * updated in a while — fine to ship as a stopgap, but re-evaluate against
 * whatever 1inch's current recommended embed method is every so often.
 */
export default function OneInchSwapWidget({ referrerAddress, referrerFeePct }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chainId = useChainId()

  useEffect(() => {
    if (!hostRef.current) return
    const provider = (window as any).ethereum
    if (!provider) return // no injected wallet — see the fallback message below

    const manager = setup1inchWidget({
      chainId: chainId || 1,
      sourceTokenSymbol: 'ETH',
      destinationTokenSymbol: 'USDT',
      hostElement: hostRef.current,
      provider,
      theme: 'dark',
    } as any)

    return () => manager.destroy()
  }, [chainId])

  const hasWallet = typeof window !== 'undefined' && !!(window as any).ethereum

  if (!hasWallet) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-8 text-center">
        <AlertTriangle className="text-yellow-400" size={28} />
        <p className="text-sm text-yellow-200">
          This swap widget needs a browser wallet (MetaMask, Rabby, etc) to
          execute trades directly from your own wallet. Install one and
          reload this page.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div ref={hostRef} className="min-h-[480px] rounded-2xl overflow-hidden" />
      {referrerAddress && (
        <p className="mt-3 text-center text-xs text-white/30">
          A small fee supports CoinBidex — see the swap details for the exact rate.
        </p>
      )}
    </div>
  )
}
