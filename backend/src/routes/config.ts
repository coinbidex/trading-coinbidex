import { Router, Response } from 'express'
import { authenticate, requireRole, AuthRequest } from '../middleware/auth'
import { prisma } from '../utils/prisma'
import { logger } from '../utils/logger'
import { getRedis } from '../utils/redis'

const router = Router()

// Non-secret keys the frontend needs at runtime. Everything the admin panel
// saves lives server-side (process.env / DB) and previously never reached
// the browser bundle — this is what made "set the WalletConnect project ID
// in the admin panel" have no visible effect. Only PUBLIC-safe keys belong
// here; anything marked `secret: true` in KEY_DOCS below must never be
// added to this list.
const PUBLIC_KEYS = ['WALLETCONNECT_PROJECT_ID', 'MOONPAY_PUBLISHABLE_KEY', 'ACTIVE_SWAP_WIDGET'] as const

router.get('/public', async (_req, res: Response) => {
  try {
    const configs = await prisma.systemConfig.findMany({ where: { key: { in: [...PUBLIC_KEYS] } } })
    const map = new Map(configs.map(c => [c.key, c.value]))
    res.json({
      success: true,
      data: {
        walletConnectProjectId: map.get('WALLETCONNECT_PROJECT_ID') || process.env.WALLETCONNECT_PROJECT_ID || '',
        moonpayPublishableKey:  map.get('MOONPAY_PUBLISHABLE_KEY')  || process.env.MOONPAY_PUBLISHABLE_KEY  || '',
        activeSwapWidget:       map.get('ACTIVE_SWAP_WIDGET')       || process.env.ACTIVE_SWAP_WIDGET       || 'oneinch',
      },
    })
  } catch (err) {
    logger.error('Get public config error:', err)
    res.status(500).json({ success: false, message: 'Failed to get public config' })
  }
})

router.use(authenticate, requireRole('ADMIN'))

const CONFIG_CHANNEL = 'system-config:updated'

// Every backend instance subscribes so a change made via the admin panel on
// one instance is applied to all of them immediately, no restart needed.
export function subscribeToConfigUpdates(): void {
  const sub = getRedis().duplicate()
  sub.subscribe(CONFIG_CHANNEL, (err) => {
    if (err) logger.error('Failed to subscribe to config updates:', err)
  })
  sub.on('message', (_channel, message) => {
    try {
      const { key, value, deleted } = JSON.parse(message)
      if (deleted) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
      logger.info(`Config "${key}" synced from another instance`)
    } catch (err) {
      logger.error('Failed to apply config update from pub/sub:', err)
    }
  })
}

async function broadcastConfigChange(key: string, value?: string, deleted = false): Promise<void> {
  try {
    await getRedis().publish(CONFIG_CHANNEL, JSON.stringify({ key, value, deleted }))
  } catch (err) {
    logger.error('Failed to broadcast config change:', err)
  }
}

const KEY_DOCS: Record<string, { label: string; category: string; description: string; howTo: string; secret: boolean }> = {
  ONEINCH_API_KEY:          { label: '1inch API Key',          category: 'Swap',     description: 'Real DEX swap routing. Free at portal.1inch.dev', howTo: 'portal.1inch.dev → Create app → Copy key. Free tier: 1M calls/month.', secret: true },
  REFERRAL_WALLET_ADDRESS:  { label: 'Your ETH Wallet',        category: 'Swap',     description: '1inch pays referral fees here automatically on-chain.', howTo: 'Any ETH address you control (MetaMask, hardware wallet).', secret: false },
  MOONPAY_PUBLISHABLE_KEY:  { label: 'MoonPay Publishable Key',category: 'Deposits', description: 'Card deposit widget. Earn 0.5-1% per purchase.', howTo: 'moonpay.com/business/partners → Apply → pk_live_...', secret: false },
  MOONPAY_SECRET_KEY:       { label: 'MoonPay Secret Key',     category: 'Deposits', description: 'Webhook signature verification.', howTo: 'Same dashboard as publishable key. sk_live_...', secret: true },
  BINANCE_BROKER_API_KEY:   { label: 'Binance Broker Key',     category: 'Trading',  description: 'Routes orders to Binance. Earn up to 40% of trading fees.', howTo: 'binance.com/en/broker → Apply (3-7 days).', secret: true },
  BINANCE_BROKER_API_SECRET:{ label: 'Binance Broker Secret',  category: 'Trading',  description: 'Paired with Broker API Key.', howTo: 'Generated with the broker key.', secret: true },
  SMTP_HOST:                { label: 'SMTP Host',              category: 'Email',    description: 'Email server for verification and alerts.', howTo: 'Gmail: smtp.gmail.com | MailerSend: smtp.mailersend.net (3K free/mo)', secret: false },
  SMTP_USER:                { label: 'SMTP Username',          category: 'Email',    description: 'Your email address or SMTP username.', howTo: 'For Gmail: use App Password at myaccount.google.com/security', secret: false },
  SMTP_PASS:                { label: 'SMTP Password',          category: 'Email',    description: 'SMTP password or app password.', howTo: 'Gmail App Password: Google Account → Security → App Passwords', secret: true },
  WALLETCONNECT_PROJECT_ID: { label: 'WalletConnect Project ID',category:'Wallets',  description: 'QR code for mobile wallets (Trust, Rainbow).', howTo: 'cloud.walletconnect.com → New Project → Copy ID. Free.', secret: false },
  ACTIVE_SWAP_WIDGET:       { label: 'Active Swap Widget',      category:'Swap',     description: 'Which swap provider users see on the Swap page: "oneinch" (1inch, needs API key + referral wallet above) or "changenow" (ChangeNOW, no API key required — good fallback if 1inch is down).', howTo: 'Type exactly: oneinch or changenow', secret: false },
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const configs = await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } })
    const configMap = new Map(configs.map(c => [c.key, c]))

    const known = Object.entries(KEY_DOCS).map(([key, doc]) => {
      const stored = configMap.get(key)
      return {
        key,
        ...doc,
        value:    stored ? (doc.secret ? '••••••••' : stored.value) : '',
        rawValue: stored?.value || '',
        isSet:    !!stored?.value,
        updatedAt:stored?.updatedAt ?? null,
      }
    })

    const custom = configs
      .filter(c => !KEY_DOCS[c.key])
      .map(c => ({
        key: c.key, label: c.key, category: 'Custom',
        description: c.description || '', howTo: '',
        secret: false, value: c.value, rawValue: c.value,
        isSet: true, updatedAt: c.updatedAt,
      }))

    res.json({ success: true, data: [...known, ...custom] })
  } catch (err) {
    logger.error('Get config error:', err)
    res.status(500).json({ success: false, message: 'Failed to get config' })
  }
})

router.put('/:key', async (req: AuthRequest, res: Response) => {
  try {
    const { key } = req.params
    const { value, description } = req.body

    if (!key || !/^[A-Z0-9_]+$/.test(key)) {
      res.status(400).json({ success: false, message: 'Invalid key format. Use uppercase letters, numbers and underscores only.' })
      return
    }

    const config = await prisma.systemConfig.upsert({
      where:  { key },
      create: { key, value: value || '', description: description || '' },
      update: { value: value || '', ...(description && { description }) },
    })

    if (value) {
      process.env[key] = value
      await broadcastConfigChange(key, value)
    }

    res.json({ success: true, data: config })
  } catch (err) {
    logger.error('Save config error:', err)
    res.status(500).json({ success: false, message: 'Failed to save config' })
  }
})

router.delete('/:key', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.systemConfig.delete({ where: { key: req.params.key } })
    delete process.env[req.params.key]
    await broadcastConfigChange(req.params.key, undefined, true)
    res.json({ success: true, message: 'Config key deleted' })
  } catch (err) {
    logger.error('Delete config error:', err)
    res.status(500).json({ success: false, message: 'Failed to delete config' })
  }
})

export async function loadConfigsFromDB(): Promise<void> {
  try {
    const configs = await prisma.systemConfig.findMany()
    for (const c of configs) {
      if (c.value) process.env[c.key] = c.value
    }
    logger.info(`Loaded ${configs.length} config keys from database`)
  } catch (err) {
    logger.error('Failed to load configs from DB:', err)
  }
}

export default router
