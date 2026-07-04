import Redis from 'ioredis';
import { logger } from './logger';

let redisClient: Redis;

export async function connectRedis(): Promise<Redis> {
  redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    lazyConnect: true,
  });

  redisClient.on('error', (err) => logger.error('Redis error:', err));
  redisClient.on('connect', () => logger.info('Redis connected'));

  await redisClient.connect();
  return redisClient;
}

export function getRedis(): Redis {
  if (!redisClient) throw new Error('Redis not connected');
  return redisClient;
}

// Cache helpers
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const val = await getRedis().get(key);
    return val ? JSON.parse(val) : null;
  },

  async set(key: string, value: any, ttlSeconds = 300): Promise<void> {
    await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
  },

  async del(key: string): Promise<void> {
    await getRedis().del(key);
  },

  async delPattern(pattern: string): Promise<void> {
    const keys = await getRedis().keys(pattern);
    if (keys.length) await getRedis().del(...keys);
  }
};
