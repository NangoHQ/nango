import { describe, expect, it, vi } from 'vitest';

import { UsageCache } from './cache.js';

describe('UsageCache', () => {
    it('tryAcquireLock returns Err on redis set failure', async () => {
        const store = {
            set: vi.fn().mockRejectedValue(new Error('redis down'))
        };
        const cache = new UsageCache(store as any);
        const res = await cache.tryAcquireLock('lock-key', { ttlMs: 1000 });
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.message).toBe('lock_acquire_error');
        }
    });

    it('get returns cache_entry_invalid when invalid entry delete fails', async () => {
        const store = {
            multi: () => ({
                hGetAll: () => ({
                    exec: () => Promise.resolve([[{ count: 'bad', revalidateAfter: 'not-a-number' }]])
                })
            }),
            del: vi.fn().mockRejectedValue(new Error('redis down'))
        };
        const cache = new UsageCache(store as any);
        const res = await cache.get('key');
        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.message).toBe('cache_entry_invalid');
        }
    });
});
