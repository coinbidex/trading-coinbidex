import { Router } from 'express';
import { body } from 'express-validator';
import { getWallets, getWalletBalance, deposit, withdraw, getPortfolioSummary } from '../controllers/walletController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

router.get('/', getWallets);
router.get('/portfolio', getPortfolioSummary);
router.get('/:symbol', getWalletBalance);
router.post('/deposit', [
  body('symbol').notEmpty().trim().toUpperCase(),
  body('amount').isFloat({ gt: 0 }),
], validate, deposit);
router.post('/withdraw', [
  body('symbol').notEmpty().trim().toUpperCase(),
  body('amount').isFloat({ gt: 0 }),
  body('address').notEmpty().trim(),
], validate, withdraw);

export default router;

import { Request } from 'express';
import axios from 'axios';

// Fetch real on-chain ERC20 balances for a wallet address
// Called by the frontend to avoid exposing RPC calls from the browser
router.get('/onchain-balances', async (req: Request, res: Response) => {
  try {
    const { address, chainId = '1' } = req.query;
    if (!address) return res.status(400).json({ success: false, message: 'address required' });

    const chain = parseInt(chainId as string);

    // RPC endpoints (use your own Infura/Alchemy key for production)
    const RPC_URLS: Record<number, string> = {
      1:   process.env.ETH_RPC_URL   || 'https://cloudflare-eth.com',
      137: process.env.POLY_RPC_URL  || 'https://polygon-rpc.com',
      56:  process.env.BSC_RPC_URL   || 'https://bsc-dataseed.binance.org',
    };

    const rpc = RPC_URLS[chain] || RPC_URLS[1];

    // ERC20 tokens to check
    const TOKEN_LIST: Record<number, Array<{ symbol: string; name: string; address: string; decimals: number }>> = {
      1: [
        { symbol: 'USDT',  name: 'Tether USD',   address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6  },
        { symbol: 'USDC',  name: 'USD Coin',      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6  },
        { symbol: 'WBTC',  name: 'Wrapped BTC',   address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8  },
        { symbol: 'LINK',  name: 'Chainlink',     address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
        { symbol: 'UNI',   name: 'Uniswap',       address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
        { symbol: 'MATIC', name: 'Polygon',       address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', decimals: 18 },
      ],
      137: [
        { symbol: 'USDT',  name: 'Tether USD',   address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6  },
        { symbol: 'USDC',  name: 'USD Coin',      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6  },
      ],
      56: [
        { symbol: 'USDT',  name: 'Tether USD',   address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
        { symbol: 'USDC',  name: 'USD Coin',      address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
      ],
    };

    const tokens = TOKEN_LIST[chain] || TOKEN_LIST[1];

    // Batch RPC calls
    const calls = tokens.map((token, i) => ({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{
        to: token.address,
        // balanceOf(address) selector = 0x70a08231
        data: '0x70a08231000000000000000000000000' + (address as string).slice(2).padStart(64, '0'),
      }, 'latest'],
      id: i,
    }));

    const rpcRes = await axios.post(rpc, calls, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    const results = Array.isArray(rpcRes.data) ? rpcRes.data : [rpcRes.data];
    const balances = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const result = results.find((r: any) => r.id === i);
      if (!result?.result || result.result === '0x') continue;

      const rawBalance = BigInt(result.result);
      if (rawBalance === 0n) continue;

      const balance = (Number(rawBalance) / 10 ** token.decimals).toFixed(token.decimals > 8 ? 6 : token.decimals);
      if (parseFloat(balance) === 0) continue;

      balances.push({
        symbol:          token.symbol,
        name:            token.name,
        balance,
        balanceRaw:      rawBalance.toString(),
        usdValue:        0,
        decimals:        token.decimals,
        contractAddress: token.address,
      });
    }

    res.json({ success: true, data: balances });
  } catch (err: any) {
    // Non-fatal — frontend falls back to native balance only
    res.json({ success: true, data: [] });
  }
});

// Register external wallet address for a user account
router.post('/connect-external', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { address, chainId } = req.body;
    if (!address) return res.status(400).json({ success: false, message: 'address required' });

    // Store in user metadata — useful for linking on-chain activity
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { metadata: { walletAddress: address, chainId } } as any,
    }).catch(() => {}); // non-fatal if field doesn't exist

    res.json({ success: true, data: { address, chainId } });
  } catch {
    res.json({ success: true }); // non-fatal
  }
});
