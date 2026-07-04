import { useCallback, useEffect } from 'react'
import {
  useAccount, useConnect, useDisconnect,
  useBalance, useReadContract, useSendTransaction,
  useChainId, useSwitchChain
} from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { useWeb3Store } from '@/store/web3Store'
import { TOKEN_CONTRACTS, ERC20_ABI, CHAIN_NATIVE } from '@/utils/web3Config'
import api from '@/utils/api'
import toast from 'react-hot-toast'

export function useWallet() {
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors, isPending: isConnecting } = useConnect()
  const { disconnect: wagmiDisconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  const { wallet, setWallet, setConnecting, disconnect: storeDisconnect } = useWeb3Store()

  // Sync wagmi state → our store
  useEffect(() => {
    if (isConnected && address) {
      setWallet({
        address,
        chainId,
        connector: connector?.name || 'unknown',
        connectedAt: Date.now(),
      })
      // Register wallet address with backend so we can link it to the account
      api.post('/wallets/connect-external', { address, chainId }).catch(() => {})
    } else if (!isConnected) {
      storeDisconnect()
    }
  }, [isConnected, address, chainId, connector])

  useEffect(() => { setConnecting(isConnecting) }, [isConnecting])

  const connectWallet = useCallback((connectorId?: string) => {
    const target = connectorId
      ? connectors.find(c => c.id === connectorId || c.name.toLowerCase().includes(connectorId.toLowerCase()))
      : connectors[0]
    if (target) connect({ connector: target })
    else toast.error('Wallet connector not found')
  }, [connectors, connect])

  const disconnect = useCallback(() => {
    wagmiDisconnect()
    storeDisconnect()
  }, [wagmiDisconnect, storeDisconnect])

  const formatAddress = (addr?: string) => {
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  return {
    address,
    chainId,
    isConnected,
    isConnecting,
    connector: connector?.name,
    connectors,
    wallet,
    connect: connectWallet,
    disconnect,
    switchChain,
    formatAddress,
  }
}

// Hook to read all token balances from the blockchain
export function useOnChainBalances() {
  const { address, chainId, isConnected } = useWallet()
  const { setBalances, setLoadingBalances, updateLastRefresh } = useWeb3Store()

  // Native token (ETH / BNB / MATIC)
  const { data: nativeBalance, refetch: refetchNative } = useBalance({
    address: address as `0x${string}`,
    query: { enabled: !!address && isConnected },
  })

  const refreshBalances = useCallback(async () => {
    if (!address || !isConnected || !chainId) return
    setLoadingBalances(true)

    try {
      const tokenContracts = TOKEN_CONTRACTS[chainId] || TOKEN_CONTRACTS[1]
      const balances = []

      // Add native token
      if (nativeBalance) {
        const nativeSymbol = CHAIN_NATIVE[chainId]?.symbol || 'ETH'
        balances.push({
          symbol:      nativeSymbol,
          name:        (CHAIN_NATIVE[chainId]?.name) || nativeSymbol,
          balance:     parseFloat(formatUnits(nativeBalance.value, 18)).toFixed(6),
          balanceRaw:  nativeBalance.value.toString(),
          usdValue:    0, // enriched later
          decimals:    18,
        })
      }

      // Fetch ERC20 balances via your backend (batched RPC call)
      // This avoids hammering public RPC nodes from the browser
      const res = await api.get(`/wallets/onchain-balances?address=${address}&chainId=${chainId}`)
      if (res.data.success) {
        balances.push(...res.data.data)
      }

      setBalances(balances)
      updateLastRefresh()
    } catch (err) {
      // Fallback: at least show native balance
      if (nativeBalance) {
        const nativeSymbol = CHAIN_NATIVE[chainId]?.symbol || 'ETH'
        setBalances([{
          symbol:    nativeSymbol,
          name:      CHAIN_NATIVE[chainId]?.name || nativeSymbol,
          balance:   parseFloat(formatUnits(nativeBalance.value, 18)).toFixed(6),
          balanceRaw: nativeBalance.value.toString(),
          usdValue:  0,
          decimals:  18,
        }])
      }
    } finally {
      setLoadingBalances(false)
    }
  }, [address, chainId, isConnected, nativeBalance])

  // Auto-refresh on connect and every 30 seconds
  useEffect(() => {
    if (isConnected && address) {
      refreshBalances()
      const interval = setInterval(refreshBalances, 30_000)
      return () => clearInterval(interval)
    }
  }, [isConnected, address, chainId])

  return { refreshBalances, refetchNative }
}

// Hook to send a transaction (used for on-chain swaps)
export function useOnChainSwap() {
  const { address, isConnected } = useWallet()
  const { sendTransactionAsync } = useSendTransaction()

  const executeOnChainSwap = useCallback(async (
    fromAsset: string,
    toAsset: string,
    fromAmount: number,
    slippage = 0.5
  ) => {
    if (!address || !isConnected) throw new Error('Wallet not connected')

    // Get the unsigned transaction from your backend (1inch builds it)
    const res = await api.post('/swaps/build-onchain', {
      fromAsset, toAsset, fromAmount,
      walletAddress: address,
      slippage,
      chainId: 1
    })

    if (!res.data.success) throw new Error(res.data.message)

    const tx = res.data.data.tx

    // Send to user's wallet for signing — MetaMask/WalletConnect popup appears
    const hash = await sendTransactionAsync({
      to:    tx.to,
      value: BigInt(tx.value || '0'),
      data:  tx.data,
      gas:   tx.gas ? BigInt(tx.gas) : undefined,
    })

    return hash
  }, [address, isConnected, sendTransactionAsync])

  return { executeOnChainSwap }
}
