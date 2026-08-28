import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { ImmediateRateLimitOverrides } from './immediateRateLimitOverrides.js';

import type { Result } from '@nangohq/utils';

describe('ImmediateRateLimitOverrides', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the override for a key and undefined for the rest', async () => {
        const overrides = new ImmediateRateLimitOverrides({ load: () => Promise.resolve(Ok(new Map([['webhook:environment:1', 500]]))) });

        await expect(overrides.get('webhook:environment:1')).resolves.toBe(500);
        await expect(overrides.get('webhook:environment:2')).resolves.toBeUndefined();
    });

    it('loads once per refresh interval, then picks up a change', async () => {
        let limit = 500;
        const load = vi.fn(() => Promise.resolve(Ok(new Map([['key', limit]]))));
        const overrides = new ImmediateRateLimitOverrides({ load, refreshIntervalMs: 30_000 });

        await overrides.get('key');
        await overrides.get('key');
        expect(load).toHaveBeenCalledOnce();

        limit = 100;
        vi.advanceTimersByTime(30_000);
        await expect(overrides.get('key')).resolves.toBe(100);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('shares a single load between concurrent calls', async () => {
        const load = vi.fn(() => Promise.resolve(Ok(new Map([['key', 500]]))));
        const overrides = new ImmediateRateLimitOverrides({ load });

        await Promise.all([overrides.get('key'), overrides.get('key'), overrides.get('key')]);

        expect(load).toHaveBeenCalledOnce();
    });

    it('keeps serving the last snapshot when loading fails', async () => {
        const results: Result<Map<string, number>>[] = [Ok(new Map([['key', 500]])), Err(new Error('database is down'))];
        const load = vi.fn(() => Promise.resolve(results.shift()!));
        const overrides = new ImmediateRateLimitOverrides({ load, refreshIntervalMs: 30_000 });

        await expect(overrides.get('key')).resolves.toBe(500);
        vi.advanceTimersByTime(30_000);

        await expect(overrides.get('key')).resolves.toBe(500);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('measures the refresh interval from when the load finished', async () => {
        const snapshot = () => Promise.resolve(Ok(new Map([['key', 500]])));
        const load = vi.fn<() => Promise<Result<Map<string, number>>>>().mockImplementationOnce(() => {
            // a load that outlives the refresh interval
            vi.advanceTimersByTime(45_000);
            return snapshot();
        });
        load.mockImplementation(snapshot);
        const overrides = new ImmediateRateLimitOverrides({ load, refreshIntervalMs: 30_000 });

        await expect(overrides.get('key')).resolves.toBe(500);

        await overrides.get('key');
        expect(load).toHaveBeenCalledOnce();

        vi.advanceTimersByTime(30_000);
        await overrides.get('key');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('serves the previous snapshot to callers that arrive while a refresh is in flight', async () => {
        let resolveSecondLoad: (value: Result<Map<string, number>>) => void = () => undefined;
        const load = vi
            .fn<() => Promise<Result<Map<string, number>>>>()
            .mockResolvedValueOnce(Ok(new Map([['key', 500]])))
            .mockImplementationOnce(() => new Promise((resolve) => (resolveSecondLoad = resolve)));
        const overrides = new ImmediateRateLimitOverrides({ load, refreshIntervalMs: 30_000 });

        await expect(overrides.get('key')).resolves.toBe(500);
        vi.advanceTimersByTime(30_000);

        const refreshing = overrides.get('key');
        await expect(overrides.get('key')).resolves.toBe(500);

        resolveSecondLoad(Ok(new Map([['key', 100]])));
        await expect(refreshing).resolves.toBe(100);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('falls back to the default when the first load fails', async () => {
        const overrides = new ImmediateRateLimitOverrides({ load: () => Promise.reject(new Error('database is down')) });

        await expect(overrides.get('key')).resolves.toBeUndefined();
    });
});
