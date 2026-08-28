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
            estimatedUsage: 6,
            retryAfterMs: 0,
            limit: 10
        });
        await expect(limiter.consume('key', 8)).resolves.toEqual({
            admitted: 4,
            rejected: 4,
            remaining: 0,
            estimatedUsage: 10,
            retryAfterMs: 1100,
            limit: 10
        });
    });

    it('does not reset usage at a fixed-window boundary', async () => {
        await limiter.destroy();
        limiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: 4, windowMs: 1000 });

        await limiter.consume('key', 4);
        vi.advanceTimersByTime(1001);

        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 0, rejected: 1, retryAfterMs: 249 });
    });

    it('partially admits as weighted usage decays', async () => {
        await limiter.destroy();
        limiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: 4, windowMs: 1000 });

        await limiter.consume('key', 4);
        vi.advanceTimersByTime(1250);

        await expect(limiter.consume('key', 3)).resolves.toEqual({
            admitted: 1,
            rejected: 2,
            remaining: 0,
            estimatedUsage: 4,
            retryAfterMs: 250,
            limit: 4
        });
    });

    it('derives retry delay from weighted usage decay', async () => {
        await limiter.destroy();
        limiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: 3, windowMs: 1000 });

        await limiter.consume('key', 3);
        vi.advanceTimersByTime(1001);

        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 0, rejected: 1, retryAfterMs: 333 });
        vi.advanceTimersByTime(332);
        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 0, rejected: 1, retryAfterMs: 1 });
        vi.advanceTimersByTime(1);
        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 1, rejected: 0, retryAfterMs: 0 });
    });

    it('caps aggregate admitted units across many callers', async () => {
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
        [{ keyPrefix: 'test', limit: 10, windowMs: 0 }, 'windowMs must be a positive safe integer'],
        [{ keyPrefix: 'test', limit: 10_000_000_000, windowMs: 1_000_000 }, 'limit multiplied by windowMs must be a safe integer'],
        [{ keyPrefix: 'test', limit: 1, windowMs: 4_503_599_627_370_496 }, 'windowMs multiplied by 2 must be a safe integer']
    ])('rejects invalid options', (options, message) => {
        expect(() => new InMemorySlidingWindowRateLimiter(options)).toThrow(message);
    });

    it('applies a per-call limit instead of the default', async () => {
        await expect(limiter.consume('key', 3, { limit: 2 })).resolves.toMatchObject({ admitted: 2, rejected: 1, limit: 2 });
        await expect(limiter.consume('key', 1)).resolves.toMatchObject({ admitted: 1, rejected: 0, limit: 10 });
    });

    it('counts a key separately per limit, so changing an override starts a fresh window', async () => {
        await limiter.consume('key', 10, { limit: 10 });

        await expect(limiter.consume('key', 10, { limit: 10 })).resolves.toMatchObject({ admitted: 0 });
        await expect(limiter.consume('key', 10, { limit: 20 })).resolves.toMatchObject({ admitted: 10 });
    });

    it('leaves a key unlimited when the per-call limit is null', async () => {
        await expect(limiter.consume('key', 1000, { limit: null })).resolves.toEqual({
            admitted: 1000,
            rejected: 0,
            remaining: null,
            estimatedUsage: null,
            retryAfterMs: 0,
            limit: null
        });
    });

    it.each([
        [0, 'limit must be a positive safe integer'],
        [1.5, 'limit must be a positive safe integer']
    ])('rejects an invalid per-call limit', async (limit, message) => {
        await expect(limiter.consume('key', 1, { limit })).rejects.toThrow(message);
    });
});

describe('InMemorySlidingWindowRateLimiter without a default limit', () => {
    let limiter: InMemorySlidingWindowRateLimiter;

    beforeEach(() => {
        limiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'test', limit: null, windowMs: 1000 });
    });

    afterEach(async () => {
        await limiter.destroy();
    });

    it('admits everything for keys without a per-call limit', async () => {
        await expect(limiter.consume('key', 1_000_000)).resolves.toMatchObject({ admitted: 1_000_000, rejected: 0, limit: null });
    });

    it('still enforces a per-call limit', async () => {
        await expect(limiter.consume('key', 5, { limit: 3 })).resolves.toMatchObject({ admitted: 3, rejected: 2, limit: 3 });
    });
});
