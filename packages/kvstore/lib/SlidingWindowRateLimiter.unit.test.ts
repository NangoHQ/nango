import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySlidingWindowRateLimiter } from './SlidingWindowRateLimiter.js';

describe('InMemorySlidingWindowRateLimiter', () => {
    let limiter: InMemorySlidingWindowRateLimiter;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        limiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: 10, windowMs: 1000 });
    });

    afterEach(async () => {
        await limiter.destroy();
        vi.useRealTimers();
    });

    it('partially admits units when the window has limited room', async () => {
        await expect(limiter.consume('key', 6)).resolves.toEqual({
            admitted: 6,
            rejected: 0,
            remaining: 4,
            currentUsage: 6,
            retryAfterMs: 0
        });
        await expect(limiter.consume('key', 8)).resolves.toEqual({
            admitted: 4,
            rejected: 4,
            remaining: 0,
            currentUsage: 10,
            retryAfterMs: 1000
        });
    });

    it('keeps the limit across a fixed-window boundary', async () => {
        await limiter.destroy();
        limiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: 4, windowMs: 1000 });

        await limiter.consume('key', 4);
        vi.advanceTimersByTime(600);

        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 0, rejected: 1, retryAfterMs: 400 });
    });

    it('only releases entries that have left the rolling window', async () => {
        await limiter.destroy();
        limiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: 4, windowMs: 1000 });

        await limiter.consume('key', 2);
        vi.advanceTimersByTime(600);
        await limiter.consume('key', 2);
        vi.advanceTimersByTime(401);

        await expect(limiter.consume('key', 3)).resolves.toEqual({
            admitted: 2,
            rejected: 1,
            remaining: 0,
            currentUsage: 4,
            retryAfterMs: 599
        });
    });

    it('derives retry delay from the oldest entry', async () => {
        await limiter.destroy();
        limiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: 3, windowMs: 1000 });

        await limiter.consume('key', 2);
        vi.advanceTimersByTime(500);

        await expect(limiter.consume('key', 2)).resolves.toMatchObject({ admitted: 1, rejected: 1, retryAfterMs: 500 });
        vi.advanceTimersByTime(499);
        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 0, rejected: 1, retryAfterMs: 1 });
        vi.advanceTimersByTime(1);
        await expect(limiter.consume('key', 2)).resolves.toMatchObject({ admitted: 2, rejected: 0, retryAfterMs: 0 });
    });

    it('does not exceed the limit under concurrent callers', async () => {
        const results = await Promise.all(Array.from({ length: 20 }, () => limiter.consume('key', 1)));

        expect(results.reduce((total, value) => total + value.admitted, 0)).toBe(10);
        expect(results.reduce((total, value) => total + value.rejected, 0)).toBe(10);
    });

    it('isolates keys', async () => {
        await limiter.consume('first', 10);

        await expect(limiter.consume('second', 10)).resolves.toMatchObject({ admitted: 10, rejected: 0 });
    });

    it.each([
        ['', 1, 'key must not be empty'],
        ['key', 0, 'units must be a positive safe integer'],
        ['key', 1.5, 'units must be a positive safe integer']
    ])('rejects invalid consumption arguments', async (key, units, message) => {
        await expect(limiter.consume(key, units)).rejects.toThrow(message);
    });

    it.each([
        [{ keyPrefix: '', limit: 10, windowMs: 1000 }, 'keyPrefix must not be empty'],
        [{ keyPrefix: '{test}', limit: 10, windowMs: 1000 }, 'keyPrefix must not contain braces'],
        [{ keyPrefix: 'test', limit: 0, windowMs: 1000 }, 'limit must be a positive safe integer'],
        [{ keyPrefix: 'test', limit: 10, windowMs: 0 }, 'windowMs must be a positive safe integer']
    ])('rejects invalid options', (options, message) => {
        expect(() => new InMemorySlidingWindowRateLimiter(options)).toThrow(message);
    });
});
