import { createClient } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { getRedis } from './index.js';
import { getRedisClientOptions } from './redisClient.js';
import { RedisSlidingWindowRateLimiter } from './SlidingWindowRateLimiter.js';

import type { NangoRedisClient } from './redisClient.js';

describe('RedisSlidingWindowRateLimiter', () => {
    const redisKey = (prefix: string, limit: number, windowMs: number, key: string) =>
        `sliding-window-rate-limit:${prefix.length}:{${prefix}}:${limit}:${windowMs}:${key}`;
    let client: NangoRedisClient;

    beforeAll(async () => {
        const url = process.env['NANGO_REDIS_URL'];
        if (!url) {
            throw new Error('NANGO_REDIS_URL environment variable is not set.');
        }
        client = await getRedis(url);
    });

    afterAll(async () => {
        await client.flushAll();
    });

    beforeEach(async () => {
        await client.flushAll();
    });

    it('partially admits units and derives retry delay from the oldest entry', async () => {
        const windowMs = 500;
        const limiter = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'partial', limit: 10, windowMs });

        await expect(limiter.consume('partial', 6)).resolves.toMatchObject({ admitted: 6, rejected: 0, remaining: 4, currentUsage: 6 });
        const limited = await limiter.consume('partial', 8);

        expect(limited).toMatchObject({ admitted: 4, rejected: 4, remaining: 0, currentUsage: 10 });
        expect(limited.retryAfterMs).toBeGreaterThan(0);
        expect(limited.retryAfterMs).toBeLessThanOrEqual(windowMs);

        await new Promise((resolve) => setTimeout(resolve, limited.retryAfterMs + 20));
        await expect(limiter.consume('partial', 6)).resolves.toMatchObject({ admitted: 6, rejected: 0 });
    });

    it('keeps the limit across a fixed-window boundary', async () => {
        const limiter = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'boundary', limit: 4, windowMs: 1000 });

        await limiter.consume('boundary', 4);
        await new Promise((resolve) => setTimeout(resolve, 600));

        await expect(limiter.consume('boundary', 1)).resolves.toMatchObject({ admitted: 0, rejected: 1 });
    });

    it('does not exceed the limit under concurrent callers', async () => {
        const limiter = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'concurrent', limit: 25, windowMs: 10_000 });
        const results = await Promise.all(Array.from({ length: 100 }, () => limiter.consume('concurrent', 1)));

        expect(results.reduce((total, value) => total + value.admitted, 0)).toBe(25);
        expect(results.reduce((total, value) => total + value.rejected, 0)).toBe(75);
        expect(await client.zCard(redisKey('concurrent', 25, 10_000, 'concurrent'))).toBe(25);
    });

    it('isolates policies that consume the same key', async () => {
        const first = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'first', limit: 1, windowMs: 1000 });
        const second = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'second', limit: 2, windowMs: 1000 });

        await expect(first.consume('shared', 2)).resolves.toMatchObject({ admitted: 1, rejected: 1 });
        await expect(second.consume('shared', 2)).resolves.toMatchObject({ admitted: 2, rejected: 0 });
    });

    it('expires idle keys', async () => {
        const windowMs = 100;
        const limiter = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'expiry', limit: 1, windowMs });

        await limiter.consume('idle', 1);
        expect(await client.exists(redisKey('expiry', 1, windowMs, 'idle'))).toBe(1);

        await new Promise((resolve) => setTimeout(resolve, windowMs * 2));
        expect(await client.exists(redisKey('expiry', 1, windowMs, 'idle'))).toBe(0);
    });

    it('fails open when Redis is unreachable', async () => {
        const unavailableClient = createClient({
            ...getRedisClientOptions('redis://127.0.0.1:1'),
            socket: { reconnectStrategy: () => false, connectTimeout: 50 }
        });
        unavailableClient.on('error', () => undefined);
        const limiter = new RedisSlidingWindowRateLimiter(() => unavailableClient.connect(), { keyPrefix: 'unreachable', limit: 1, windowMs: 1000 });

        await expect(limiter.consume('unreachable', 5)).resolves.toEqual({
            admitted: 5,
            rejected: 0,
            remaining: null,
            currentUsage: null,
            retryAfterMs: 0
        });
    });
});
