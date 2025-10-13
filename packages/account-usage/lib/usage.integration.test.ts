import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getKVStore } from '@nangohq/kvstore';

import { Usage } from './usage.js';

import type { KVStore } from '@nangohq/kvstore';

describe('Usage', () => {
    let store: KVStore;
    let usage: Usage;

    beforeAll(async () => {
        store = await getKVStore();
        usage = new Usage(store);
    });

    afterAll(async () => {
        await store.destroy();
    });

    beforeEach(async () => {
        // Clear all usage data before each test
        for await (const key of store.scan('usage:*')) {
            await store.delete(key);
        }
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    it('should incr metric', async () => {
        const accountId = 1;
        const metric = 'connections';

        const revalidateSpy = vi.spyOn(Usage as any, 'revalidate');

        let res = (await usage.incr({ accountId, metric, delta: 5 })).unwrap();
        expect(res).toEqual({ accountId, metric, current: 5 });

        res = (await usage.incr({ accountId, metric, delta: -4 })).unwrap();
        expect(res).toEqual({ accountId, metric, current: 1 });
        // revalidateAfter hasn't passed yet
        expect(revalidateSpy).not.toHaveBeenCalled();

        // Move time forward by 1 day to pass revalidateAfter
        vi.advanceTimersByTime(24 * 60 * 60 * 1000);

        res = (await usage.incr({ accountId, metric, delta: 10 })).unwrap();
        expect(res).toEqual({ accountId, metric, current: 11 });
        expect(revalidateSpy).toHaveBeenCalledTimes(1);
    });
    it('should incr monthly metric', async () => {
        const accountId = 2;
        const metric = 'proxy';
        const res = (await usage.incr({ accountId, metric, delta: 1 })).unwrap();
        expect(res).toEqual({ accountId, metric, current: 1 });
    });
});
