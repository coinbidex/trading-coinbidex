// Central registry mapping trading symbols to real coin metadata (name, brand
// color, and a real vendor icon — served from the public, CDN-hosted
// cryptocurrency-icons set). Used anywhere we render a market/asset row so we
// never fall back to generic line icons for a coin.

export interface CoinMeta {
  symbol: string      // e.g. BTC
  name: string
  color: string        // brand color for fallback badge / accents
  slug: string          // icon slug on the CDN
}

export const COINS: Record<string, CoinMeta> = {
  BTC:   { symbol: 'BTC',   name: 'Bitcoin',        color: '#F7931A', slug: 'btc'   },
  ETH:   { symbol: 'ETH',   name: 'Ethereum',       color: '#627EEA', slug: 'eth'   },
  BNB:   { symbol: 'BNB',   name: 'BNB',            color: '#F3BA2F', slug: 'bnb'   },
  SOL:   { symbol: 'SOL',   name: 'Solana',         color: '#14F195', slug: 'sol'   },
  XRP:   { symbol: 'XRP',   name: 'XRP',            color: '#23292F', slug: 'xrp'   },
  ADA:   { symbol: 'ADA',   name: 'Cardano',        color: '#0033AD', slug: 'ada'   },
  DOGE:  { symbol: 'DOGE',  name: 'Dogecoin',       color: '#C2A633', slug: 'doge'  },
  DOT:   { symbol: 'DOT',   name: 'Polkadot',       color: '#E6007A', slug: 'dot'   },
  LINK:  { symbol: 'LINK',  name: 'Chainlink',      color: '#2A5ADA', slug: 'link'  },
  MATIC: { symbol: 'MATIC', name: 'Polygon',        color: '#8247E5', slug: 'matic' },
  POL:   { symbol: 'POL',   name: 'Polygon',        color: '#8247E5', slug: 'matic' },
  AVAX:  { symbol: 'AVAX',  name: 'Avalanche',      color: '#E84142', slug: 'avax'  },
  UNI:   { symbol: 'UNI',   name: 'Uniswap',        color: '#FF007A', slug: 'uni'   },
  LTC:   { symbol: 'LTC',   name: 'Litecoin',       color: '#345D9D', slug: 'ltc'   },
  ATOM:  { symbol: 'ATOM',  name: 'Cosmos',         color: '#2E3148', slug: 'atom'  },
  TRX:   { symbol: 'TRX',   name: 'TRON',           color: '#EF0027', slug: 'trx'   },
  SHIB:  { symbol: 'SHIB',  name: 'Shiba Inu',      color: '#FFA409', slug: 'shib'  },
  TON:   { symbol: 'TON',   name: 'Toncoin',        color: '#0098EA', slug: 'ton'   },
  NEAR:  { symbol: 'NEAR',  name: 'NEAR Protocol',  color: '#00C08B', slug: 'near'  },
  APT:   { symbol: 'APT',   name: 'Aptos',          color: '#00D2B0', slug: 'apt'   },
  FIL:   { symbol: 'FIL',   name: 'Filecoin',       color: '#0090FF', slug: 'fil'   },
  ETC:   { symbol: 'ETC',   name: 'Ethereum Classic', color: '#328332', slug: 'etc' },
  XLM:   { symbol: 'XLM',   name: 'Stellar',        color: '#14B6E7', slug: 'xlm'  },
  ICP:   { symbol: 'ICP',   name: 'Internet Computer', color: '#3B00B9', slug: 'icp' },
  FTM:   { symbol: 'FTM',   name: 'Fantom',         color: '#1969FF', slug: 'ftm'  },
  ALGO:  { symbol: 'ALGO',  name: 'Algorand',       color: '#000000', slug: 'algo' },
  VET:   { symbol: 'VET',   name: 'VeChain',        color: '#15BDFF', slug: 'vet'  },
  SAND:  { symbol: 'SAND',  name: 'The Sandbox',    color: '#00ADEF', slug: 'sand' },
  MANA:  { symbol: 'MANA',  name: 'Decentraland',   color: '#FF2D55', slug: 'mana' },
  AXS:   { symbol: 'AXS',   name: 'Axie Infinity',  color: '#0055D5', slug: 'axs'  },
  USDT:  { symbol: 'USDT',  name: 'Tether',         color: '#26A17B', slug: 'usdt' },
  USDC:  { symbol: 'USDC',  name: 'USD Coin',       color: '#2775CA', slug: 'usdc' },
}

// CoinGecko IDs for pulling real, live prices as a resilient fallback source.
export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', DOT: 'polkadot',
  LINK: 'chainlink', MATIC: 'matic-network', POL: 'matic-network',
  AVAX: 'avalanche-2', UNI: 'uniswap', LTC: 'litecoin', ATOM: 'cosmos',
  TRX: 'tron', SHIB: 'shiba-inu', TON: 'the-open-network', NEAR: 'near',
  APT: 'aptos', FIL: 'filecoin', ETC: 'ethereum-classic', XLM: 'stellar',
  ICP: 'internet-computer', FTM: 'fantom', ALGO: 'algorand', VET: 'vechain',
  SAND: 'the-sandbox', MANA: 'decentraland', AXS: 'axie-infinity',
  USDT: 'tether', USDC: 'usd-coin',
}

export function baseSymbol(pairOrSymbol: string): string {
  return pairOrSymbol.replace(/USDT$|USDC$|BUSD$/i, '').toUpperCase()
}

export function coinMeta(pairOrSymbol: string): CoinMeta {
  const sym = baseSymbol(pairOrSymbol)
  return COINS[sym] || { symbol: sym, name: sym, color: '#64748b', slug: sym.toLowerCase() }
}

// Real vendor icon (color, 128px) via jsDelivr CDN of the widely-used
// cryptocurrency-icons set. Falls back handled by <CoinIcon/> itself.
export function iconUrl(pairOrSymbol: string): string {
  const meta = coinMeta(pairOrSymbol)
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${meta.slug}.png`
}
