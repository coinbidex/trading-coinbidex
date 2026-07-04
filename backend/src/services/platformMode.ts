// Single source of truth for demo vs live behavior
export type PlatformMode = 'demo' | 'live'

export const PLATFORM_MODE: PlatformMode =
  process.env.PLATFORM_MODE === 'live' ? 'live' : 'demo'

export const IS_DEMO = PLATFORM_MODE === 'demo'
export const IS_LIVE = PLATFORM_MODE === 'live'

export const platformConfig = {
  mode:                     PLATFORM_MODE,
  isDemo:                   IS_DEMO,
  isLive:                   IS_LIVE,
  requireEmailVerification: IS_LIVE,
  sendLoginAlerts:          IS_LIVE,
  useFakeBalances:          IS_DEMO,
  autoGrantDemoFunds:       IS_DEMO,
  executeOnChain:           IS_LIVE,
  recordRevenue:            IS_LIVE,
  moonPayEnabled:           IS_LIVE && !!process.env.MOONPAY_PUBLISHABLE_KEY,
  withdrawalEnabled:        IS_LIVE,
  apiRateLimit:             IS_DEMO ? 500 : 200,
  authRateLimit:            IS_DEMO ? 50  : 10,
}
