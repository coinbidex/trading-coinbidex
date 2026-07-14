import { Shield, ExternalLink } from 'lucide-react'

/**
 * ChangeNOW's public exchange widget. It's a plain iframe — no API key, no
 * backend integration, no account required to display it. That makes it a
 * good "always-on" fallback swap option: if the 1inch integration is
 * misconfigured or 1inch's API is down, this keeps a working swap flow live
 * on the site. ChangeNOW settles the trade themselves (non-custodial,
 * fixed/floating rate exchange) and can pay a referral commission if you
 * add your own referral link id via the CHANGENOW_REF_ID config key later.
 */
export default function ChangeNowSwapWidget() {
  return (
    <div className="max-w-md mx-auto animate-fade-in">
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="font-semibold text-dark-900 dark:text-white">Swap</h2>
          <span className="badge badge-blue text-[10px]">via ChangeNOW</span>
        </div>
        <iframe
          title="ChangeNOW swap widget"
          src="https://changenow.io/embeds/exchange-widget/v2/widget.html?FAQ=false&darkMode=auto&horizontal=false&lang=en-US&locales=true&logo=true&primaryColor=1a56ff&backgroundColor=ffffff&from=btc&to=eth&amount=0.1&amountFiat=1500"
          width="100%"
          height="480"
          style={{ border: 'none' }}
          allow="clipboard-write"
        />
      </div>
      <div className="flex items-start gap-2 mt-3 text-xs text-dark-400 px-1">
        <Shield size={13} className="shrink-0 mt-0.5" />
        <p>
          Trades here are executed directly by ChangeNOW, not by this platform. No sign-up needed — swap and send to any wallet address.
          <a href="https://changenow.io" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 ml-1 text-brand-500 hover:text-brand-600 font-medium">
            changenow.io <ExternalLink size={10}/>
          </a>
        </p>
      </div>
    </div>
  )
}
