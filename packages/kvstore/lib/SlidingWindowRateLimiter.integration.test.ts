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

    async function getRedisTimeMs(): Promise<number> {
        const [seconds, microseconds] = await client.time();
        return Number(seconds) * 1000 + Math.floor(Number(microseconds) / 1000);
    }

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

    it('partially admits units and derives retry delay from weighted usage', async () => {
        const windowMs = 1000;
        const limiter = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'partial', limit: 10, windowMs });

        await expect(limiter.consume('partial', 6)).resolves.toMatchObject({ admitted: 6, rejected: 0, remaining: 4, estimatedUsage: 6 });
        const limited = await limiter.consume('partial', 8);

        expect(limited).toMatchObject({ admitted: 4, rejected: 4, remaining: 0, estimatedUsage: 10 });
        expect(limited.retryAfterMs).toBeGreaterThan(0);
        expect(limited.retryAfterMs).toBeLessThanOrEqual(windowMs + Math.ceil(windowMs / 10));

        await new Promise((resolve) => setTimeout(resolve, limited.retryAfterMs + 20));
        await expect(limiter.consume('partial', 1)).resolves.toMatchObject({ admitted: 1, rejected: 0 });
    });

    it('keeps the limit across a fixed-window boundary', async () => {
        const windowMs = 5000;
        const key = redisKey('boundary', 4, windowMs, 'boundary');
        const limiter = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'boundary', limit: 4, windowMs });
        let redisTimeMs: number | undefined;

        for (let attempt = 0; attempt < 3; attempt++) {
            const before = await getRedisTimeMs();
            await limiter.consume('boundary', 4);
            const after = await getRedisTimeMs();
            if (Math.floor(before / windowMs) === Math.floor(after / windowMs)) {
                redisTimeMs = after;
                break;
            }
            await client.del(key);
        }
        if (redisTimeMs === undefined) {
            throw new Error('Failed to consume within one Redis window');
        }

        await new Promise((resolve) => setTimeout(resolve, windowMs - (redisTimeMs % windowMs) + 100));

        await expect(limiter.consume('boundary', 1)).resolves.toMatchObject({ admitted: 0, rejected: 1 });
        await expect(client.hGetAll(key)).resolves.toMatchObject({ current: '0', previous: '4' });
    });

    it('does not exceed the limit under concurrent callers', async () => {
        const limiter = new RedisSlidingWindowRateLimiter(client, { keyPrefix: 'concurrent', limit: 25, windowMs: 10_000 });
        const results = await Promise.all(Array.from({ length: 100 }, () => limiter.consume('concurrent', 1)));

        expect(results.reduce((total, value) => total + value.admitted, 0)).toBe(25);
        expect(results.reduce((total, value) => total + value.rejected, 0)).toBe(75);
        expect(await client.hLen(redisKey('concurrent', 25, 10_000, 'concurrent'))).toBe(3);
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

        await new Promise((resolve) => setTimeout(resolve, windowMs * 3));
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
            estimatedUsage: null,
            retryAfterMs: 0
        });
    });
});
