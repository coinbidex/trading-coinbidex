import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface WalletBalance {
  symbol: string
  name: string
  balance: string        // human-readable
  balanceRaw: string     // wei / smallest unit
  usdValue: number
  contractAddress?: string
  decimals: number
  logoUrl?: string
}

export interface ConnectedWallet {
  address: string
  chainId: number
  connector: string      // 'metaMask' | 'walletConnect' | 'coinbaseWallet' | 'injected'
  ens?: string
  connectedAt: number
}

interface Web3State {
  wallet: ConnectedWallet | null
  balances: WalletBalance[]
  isConnecting: boolean
  isLoadingBalances: boolean
  lastBalanceRefresh: number

  setWallet:   (w: ConnectedWallet | null) => void
  setBalances: (b: WalletBalance[]) => void
  setConnecting:       (v: boolean) => void
  setLoadingBalances:  (v: boolean) => void
  updateLastRefresh:   () => void
  disconnect:          () => void
}

export const useWeb3Store = create<Web3State>()(
  persist(
    (set) => ({
      wallet:              null,
      balances:            [],
      isConnecting:        false,
      isLoadingBalances:   false,
      lastBalanceRefresh:  0,

      setWallet:   (w) => set({ wallet: w }),
      setBalances: (b) => set({ balances: b }),
      setConnecting:      (v) => set({ isConnecting: v }),
      setLoadingBalances: (v) => set({ isLoadingBalances: v }),
      updateLastRefresh:  ()  => set({ lastBalanceRefresh: Date.now() }),
      disconnect: () => set({ wallet: null, balances: [] }),
    }),
    {
      name: 'cryptex-web3',
      partialize: (s) => ({ wallet: s.wallet }),
    }
  )
)
