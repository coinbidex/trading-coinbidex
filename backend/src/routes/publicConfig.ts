import { Router } from 'express';

const router = Router();

// Unauthenticated, on purpose — the frontend needs this before a user is
// ever logged in (or without logging in at all) to decide which swap
// widget to render. Only ever expose specific, deliberately-public values
// here — never reuse this file's pattern for anything that should stay
// admin-only (API secrets, provider credentials, etc all stay behind
// routes/config.ts, which requires ADMIN auth).
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      swapWidgetProvider: process.env.SWAP_WIDGET_PROVIDER || 'internal',
      swapReferrerAddress: process.env.SWAP_REFERRER_ADDRESS || '',
      swapReferrerFeePct: parseFloat(process.env.SWAP_REFERRER_FEE_PCT || '0'),
    },
  });
});

export default router;
