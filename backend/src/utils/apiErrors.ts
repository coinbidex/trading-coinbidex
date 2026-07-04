// Translates ugly 1inch/blockchain errors into human-readable messages
export function translateSwapError(error: any): string {
  const msg = error?.response?.data?.description
    || error?.response?.data?.message
    || error?.message
    || 'Swap failed'

  // 1inch specific errors
  if (msg.includes('Not enough') && msg.includes('balance')) {
    const token = msg.includes('ETH') ? 'ETH' : 'tokens'
    return `Insufficient balance. Your wallet doesn't have enough ${token} for this swap.`
  }
  if (msg.includes('fee must not be greater')) return 'Invalid fee configuration. Please contact support.'
  if (msg.includes('insufficient liquidity')) return 'Not enough liquidity for this swap. Try a smaller amount.'
  if (msg.includes('Cannot estimate')) return 'Unable to estimate gas. Your wallet may have insufficient ETH for gas fees.'
  if (msg.includes('allowance')) return 'Token approval required. Please approve the token first.'
  if (msg.includes('slippage')) return 'Price moved too much. Try increasing slippage tolerance in settings.'
  if (msg.includes('expired')) return 'Quote expired. Please refresh and try again.'

  // MetaMask / wallet errors
  if (msg.includes('User rejected') || msg.includes('user rejected')) return 'Transaction cancelled in wallet.'
  if (msg.includes('insufficient funds')) return 'Insufficient ETH for gas fees. Add ETH to your wallet.'
  if (msg.includes('nonce')) return 'Transaction conflict. Please wait a moment and try again.'
  if (msg.includes('gas')) return 'Gas estimation failed. The transaction may not succeed.'

  // Network errors
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) return 'Request timed out. Please try again.'
  if (msg.includes('network') || msg.includes('ECONNREFUSED')) return 'Network error. Please check your connection.'

  // Generic 400/500
  if (error?.response?.status === 400) return 'Invalid swap parameters. Please check the amounts and try again.'
  if (error?.response?.status === 429) return 'Too many requests. Please wait a moment and try again.'
  if (error?.response?.status >= 500) return 'Service temporarily unavailable. Please try again shortly.'

  return 'Swap failed. Please try again.'
}