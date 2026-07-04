import { createConfig, http } from 'wagmi'
import { mainnet, polygon, bsc, optimism, arbitrum, base } from 'wagmi/chains'
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors'

export const SUPPORTED_CHAINS = [mainnet, polygon, bsc, optimism, arbitrum, base]

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ''

const connectors: any[] = [
  injected({ target: 'metaMask' }),  // MetaMask specifically first
  injected(),                         // Any other injected (Brave, Trust browser, etc.)
  coinbaseWallet({ appName: 'Coinbidex', appLogoUrl: 'https://trade.coinbidex.com/logo.png' }),
]

// Enable WalletConnect only if project ID is configured
if (WC_PROJECT_ID) {
  connectors.push(
    walletConnect({
      projectId: WC_PROJECT_ID,
      metadata: {
        name: 'Coinbidex',
        description: 'Trade Crypto Like a Pro',
        url: 'https://trade.coinbidex.com',
        icons: ['https://trade.coinbidex.com/logo.png'],
      },
      showQrModal: true,  // Shows the QR code modal automatically
    })
  )
}

export const wagmiConfig = createConfig({
  chains: SUPPORTED_CHAINS as any,
  connectors,
  transports: {
    [mainnet.id]:  http(import.meta.env.VITE_ETH_RPC  || undefined),
    [polygon.id]:  http(import.meta.env.VITE_POLY_RPC || undefined),
    [bsc.id]:      http(import.meta.env.VITE_BSC_RPC  || undefined),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
    [base.id]:     http(),
  },
})

export const TOKEN_CONTRACTS: Record<number, Record<string, `0x${string}`>> = {
  1: {
    USDT:  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC:  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WBTC:  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    DAI:   '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    LINK:  '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    UNI:   '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    MATIC: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    AAVE:  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    WETH:  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  137: {
    USDT:  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    USDC:  '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    WETH:  '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    DAI:   '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    WMATIC:'0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    LINK:  '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
  },
  56: {
    USDT:  '0x55d398326f99059fF775485246999027B3197955',
    USDC:  '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    WBNB:  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    BTCB:  '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    DAI:   '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    ETH:   '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
  },
  10: {
    USDT:  '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    USDC:  '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    WETH:  '0x4200000000000000000000000000000000000006',
    DAI:   '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  },
  42161: {
    USDT:  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    USDC:  '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    WETH:  '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    DAI:   '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    ARB:   '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  8453: {
    USDC:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    WETH:  '0x4200000000000000000000000000000000000006',
    DAI:   '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  },
}

export const CHAIN_NAMES: Record<number, string> = {
  1:     'Ethereum',
  137:   'Polygon',
  56:    'BNB Chain',
  10:    'Optimism',
  42161: 'Arbitrum',
  8453:  'Base',
}

export const CHAIN_NATIVE: Record<number, { symbol: string; name: string; decimals: number }> = {
  1:     { symbol: 'ETH',   name: 'Ethereum', decimals: 18 },
  137:   { symbol: 'MATIC', name: 'Polygon',  decimals: 18 },
  56:    { symbol: 'BNB',   name: 'BNB',      decimals: 18 },
  10:    { symbol: 'ETH',   name: 'Ethereum', decimals: 18 },
  42161: { symbol: 'ETH',   name: 'Ethereum', decimals: 18 },
  8453:  { symbol: 'ETH',   name: 'Ethereum', decimals: 18 },
}

export const CHAIN_EXPLORER: Record<number, string> = {
  1:     'https://etherscan.io',
  137:   'https://polygonscan.com',
  56:    'https://bscscan.com',
  10:    'https://optimistic.etherscan.io',
  42161: 'https://arbiscan.io',
  8453:  'https://basescan.org',
}

export const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'decimals',  type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { name: 'symbol',    type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const
