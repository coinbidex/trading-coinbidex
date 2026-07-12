import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const isDemo = process.env.PLATFORM_MODE !== 'live';

async function seed() {
  const mode = isDemo ? 'DEMO' : 'LIVE';
  console.log(`\n🌱 Seeding database [${mode} mode]...\n`);

  // Assets
  const assets = await Promise.all([
    prisma.asset.upsert({ where:{symbol:'BTC'},  update:{}, create:{symbol:'BTC',  name:'Bitcoin',      slug:'bitcoin',      logoUrl:'https://cdn.coinranking.com/bOabBYkcX/bitcoin_btc.svg', rank:1,  decimals:8  }}),
    prisma.asset.upsert({ where:{symbol:'ETH'},  update:{}, create:{symbol:'ETH',  name:'Ethereum',     slug:'ethereum',     logoUrl:'https://cdn.coinranking.com/rk4RKHOuW/eth.svg',          rank:2,  decimals:18 }}),
    prisma.asset.upsert({ where:{symbol:'USDT'}, update:{}, create:{symbol:'USDT', name:'Tether USD',   slug:'tether',       logoUrl:'https://cdn.coinranking.com/mgHqwlCLs/usdt.svg',         rank:3,  decimals:6  }}),
    prisma.asset.upsert({ where:{symbol:'BNB'},  update:{}, create:{symbol:'BNB',  name:'BNB',          slug:'bnb',           logoUrl:'https://cdn.coinranking.com/B1N19L_dZ/bnb.svg',          rank:4,  decimals:18 }}),
    prisma.asset.upsert({ where:{symbol:'SOL'},  update:{}, create:{symbol:'SOL',  name:'Solana',       slug:'solana',        logoUrl:'https://cdn.coinranking.com/yvUG4Qex5/solana.svg',       rank:5,  decimals:9  }}),
    prisma.asset.upsert({ where:{symbol:'XRP'},  update:{}, create:{symbol:'XRP',  name:'XRP',          slug:'xrp',           rank:6,  decimals:6  }}),
    prisma.asset.upsert({ where:{symbol:'ADA'},  update:{}, create:{symbol:'ADA',  name:'Cardano',      slug:'cardano',       rank:7,  decimals:6  }}),
    prisma.asset.upsert({ where:{symbol:'DOGE'}, update:{}, create:{symbol:'DOGE', name:'Dogecoin',     slug:'dogecoin',      rank:8,  decimals:8  }}),
    prisma.asset.upsert({ where:{symbol:'DOT'},  update:{}, create:{symbol:'DOT',  name:'Polkadot',     slug:'polkadot',      rank:9,  decimals:10 }}),
    prisma.asset.upsert({ where:{symbol:'LINK'}, update:{}, create:{symbol:'LINK', name:'Chainlink',    slug:'chainlink',     rank:10, decimals:18 }}),
    prisma.asset.upsert({ where:{symbol:'MATIC'},update:{}, create:{symbol:'MATIC',name:'Polygon',      slug:'polygon',       rank:11, decimals:18 }}),
    prisma.asset.upsert({ where:{symbol:'AVAX'}, update:{}, create:{symbol:'AVAX', name:'Avalanche',    slug:'avalanche',     rank:12, decimals:18 }}),
    prisma.asset.upsert({ where:{symbol:'UNI'},  update:{}, create:{symbol:'UNI',  name:'Uniswap',      slug:'uniswap',       rank:13, decimals:18 }}),
    prisma.asset.upsert({ where:{symbol:'LTC'},  update:{}, create:{symbol:'LTC',  name:'Litecoin',     slug:'litecoin',      rank:14, decimals:8  }}),
    prisma.asset.upsert({ where:{symbol:'ATOM'}, update:{}, create:{symbol:'ATOM', name:'Cosmos',       slug:'cosmos',        rank:15, decimals:6  }}),
    prisma.asset.upsert({ where:{symbol:'NEAR'}, update:{}, create:{symbol:'NEAR', name:'NEAR Protocol', slug:'near',         rank:16, decimals:24 }}),
    prisma.asset.upsert({ where:{symbol:'ARB'},  update:{}, create:{symbol:'ARB',  name:'Arbitrum',     slug:'arbitrum',      rank:17, decimals:18 }}),
    prisma.asset.upsert({ where:{symbol:'OP'},   update:{}, create:{symbol:'OP',   name:'Optimism',     slug:'optimism',      rank:18, decimals:18 }}),
    prisma.asset.upsert({ where:{symbol:'USDC'}, update:{}, create:{symbol:'USDC', name:'USD Coin',     slug:'usd-coin',      rank:19, decimals:6  }}),
    prisma.asset.upsert({ where:{symbol:'DAI'},  update:{}, create:{symbol:'DAI',  name:'Dai',          slug:'dai',           rank:20, decimals:18 }}),
  ]);
  console.log(`  ✅ ${assets.length} assets`);

  // Markets
  const usdt = assets.find(a => a.symbol === 'USDT')!;
  let markets = 0;
  for (const asset of assets.filter(a => a.symbol !== 'USDT')) {
    await prisma.market.upsert({
      where:  { symbol: `${asset.symbol}USDT` },
      update: {},
      create: { symbol:`${asset.symbol}USDT`, baseAssetId:asset.id, quoteAssetId:usdt.id, makerFee:0.001, takerFee:0.001, minOrderSize:0.00001, maxOrderSize:1000000 }
    });
    markets++;
  }
  console.log(`  ✅ ${markets} markets`);

  // Admin user
  const adminPw = await bcrypt.hash('Admin@123456', 10);
  const admin = await prisma.user.upsert({
    where:  { email: 'admin@coinbidex.io' },
    update: {},
    create: { email:'admin@coinbidex.io', username:'admin', passwordHash:adminPw, role:'ADMIN', status:'ACTIVE', emailVerified:true, kycStatus:'APPROVED' }
  });

  // Demo trader
  const demoPw = await bcrypt.hash('Demo@123456', 10);
  const demo = await prisma.user.upsert({
    where:  { email: 'demo@coinbidex.io' },
    update: {},
    create: { email:'demo@coinbidex.io', username:'demo_trader', passwordHash:demoPw, role:'TRADER', status:'ACTIVE', emailVerified:true, kycStatus:'APPROVED' }
  });

  if (isDemo) {
    // DEMO MODE: give users paper money to play with
    console.log('  [DEMO] Adding paper trading balances...');
    const demoBalances: Record<string, number> = {
      USDT:100000, BTC:2, ETH:20, BNB:50, SOL:200, XRP:10000,
      ADA:5000, DOGE:50000, MATIC:5000, LINK:500, AVAX:100, DOT:500,
      UNI:300, LTC:50, ATOM:200, USDC:10000, DAI:5000
    };
    for (const asset of assets) {
      const bal = demoBalances[asset.symbol] || 100;
      await prisma.wallet.upsert({
        where:  { userId_assetId: { userId:demo.id, assetId:asset.id } },
        update: {},
        create: { userId:demo.id, assetId:asset.id, balance:bal }
      });
      // Give admin balances too
      await prisma.wallet.upsert({
        where:  { userId_assetId: { userId:admin.id, assetId:asset.id } },
        update: {},
        create: { userId:admin.id, assetId:asset.id, balance:bal * 10 }
      });
    }
    console.log('  ✅ Paper balances added (demo mode)');
  } else {
    // LIVE MODE: zero balances — real wallets connected
    console.log('  [LIVE] Zero balances — users connect real wallets');
    for (const asset of assets) {
      await prisma.wallet.upsert({
        where:  { userId_assetId: { userId:demo.id,  assetId:asset.id } },
        update: {},
        create: { userId:demo.id,  assetId:asset.id, balance:0 }
      });
      await prisma.wallet.upsert({
        where:  { userId_assetId: { userId:admin.id, assetId:asset.id } },
        update: {},
        create: { userId:admin.id, assetId:asset.id, balance:0 }
      });
    }
  }

  // System config defaults
  await prisma.systemConfig.upsert({
    where:  { key: 'PLATFORM_MODE' },
    update: { value: isDemo ? 'demo' : 'live' },
    create: { key:'PLATFORM_MODE', value:isDemo ? 'demo' : 'live', description:'Platform operating mode' }
  });

  // Promotion packages — flat, realistic pricing for a growing exchange.
  // Replaces the old flat 0.1 BTC listing fee (~$6,500 at current prices —
  // high enough to turn away exactly the early-stage projects most likely
  // to actually want a new exchange) and the CPC/CPM ad model.
  const packages: Array<{ type: 'LISTING' | 'ADVERTISEMENT'; name: string; durationHours: number; price: number; sortOrder: number }> = [
    { type: 'LISTING',       name: '1 Week Listing',   durationHours: 24 * 7,   price: 49,   sortOrder: 1 },
    { type: 'LISTING',       name: '1 Month Listing',  durationHours: 24 * 30,  price: 149,  sortOrder: 2 },
    { type: 'LISTING',       name: '3 Month Listing',  durationHours: 24 * 90,  price: 349,  sortOrder: 3 },
    { type: 'LISTING',       name: '1 Year Listing',   durationHours: 24 * 365, price: 999,  sortOrder: 4 },
    { type: 'ADVERTISEMENT', name: '1 Day Banner',     durationHours: 24,       price: 15,   sortOrder: 1 },
    { type: 'ADVERTISEMENT', name: '1 Week Banner',    durationHours: 24 * 7,   price: 79,   sortOrder: 2 },
    { type: 'ADVERTISEMENT', name: '1 Month Banner',   durationHours: 24 * 30,  price: 249,  sortOrder: 3 },
    { type: 'ADVERTISEMENT', name: '1 Year Banner',    durationHours: 24 * 365, price: 1999, sortOrder: 4 },
  ];
  for (const pkg of packages) {
    const existing = await prisma.promoPackage.findFirst({ where: { type: pkg.type, name: pkg.name } });
    if (!existing) {
      await prisma.promoPackage.create({ data: pkg });
    }
  }

  console.log(`
  ✅ Admin  : admin@coinbidex.io / Admin@123456
  ✅ Demo   : demo@coinbidex.io  / Demo@123456
  ${isDemo ? '🧪 Mode   : DEMO — paper trading, safe to share' : '⚡ Mode   : LIVE — real wallets, real trading'}

  🎉 Seeding complete!
  `);
}

seed().catch(e => { console.error('Seed error:', e); process.exit(1); }).finally(() => prisma.$disconnect());
