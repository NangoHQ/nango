import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryKVStore } from '@nangohq/kvstore';

import * as locks from './locks.js';

import type { KVStore } from '@nangohq/kvstore';

function createLocks(store: KVStore) {
    return {
        tryAcquireLock: (params: { owner: string; key: string; ttlMs: number }) => locks.tryAcquireLock(store, params),
        releaseLock: (params: { owner: string; key: string }) => locks.releaseLock(store, params),
        releaseAllLocks: (params: { owner: string }) => locks.releaseAllLocks(store, params),
        hasLock: (params: { owner: string; key: string }) => locks.hasLock(store, params)
    };
}

describe('coordination locks', () => {
    let store: InMemoryKVStore;

    beforeEach(() => {
        vi.useFakeTimers();
        store = new InMemoryKVStore();
    });

    afterEach(async () => {
        vi.useRealTimers();
        await store.destroy();
    });

    it('releaseLock by a former owner must not remove the lock after another owner acquired post-expiry', async () => {
        const lockApi = createLocks(store);
        expect((await lockApi.tryAcquireLock({ owner: 'owner1', key: 'handoff', ttlMs: 100 })).unwrap()).toBe(true);
        vi.advanceTimersByTime(101);
        expect((await lockApi.tryAcquireLock({ owner: 'owner2', key: 'handoff', ttlMs: 10_000 })).unwrap()).toBe(true);

        expect((await lockApi.releaseLock({ owner: 'owner1', key: 'handoff' })).unwrap()).toBe(false);
        expect((await lockApi.hasLock({ owner: 'owner2', key: 'handoff' })).unwrap()).toBe(true);
    });

    it('tryAcquireLock by a former owner must not take the lock after another owner acquired post-expiry', async () => {
        const lockApi = createLocks(store);
        expect((await lockApi.tryAcquireLock({ owner: 'owner1', key: 'handoff-acq', ttlMs: 100 })).unwrap()).toBe(true);
        vi.advanceTimersByTime(101);
        expect((await lockApi.tryAcquireLock({ owner: 'owner2', key: 'handoff-acq', ttlMs: 10_000 })).unwrap()).toBe(true);

        expect((await lockApi.tryAcquireLock({ owner: 'owner1', key: 'handoff-acq', ttlMs: 10_000 })).unwrap()).toBe(false);
        expect((await lockApi.hasLock({ owner: 'owner2', key: 'handoff-acq' })).unwrap()).toBe(true);
    });

    it('releaseAllLocks must not remove a lock whose value was taken over by another owner', async () => {
        const lockApi = createLocks(store);
        expect((await lockApi.tryAcquireLock({ owner: 'owner1', key: 'reassigned', ttlMs: 10_000 })).unwrap()).toBe(true);
        const keyList: string[] = [];
        for await (const k of store.scan('runner:lock:*')) {
            if (!k.startsWith('runner:lock:owner:')) {
                keyList.push(k);
            }
        }
        expect(keyList).toHaveLength(1);
        await store.set(keyList[0]!, 'owner2', { canOverride: true, ttlMs: 10_000 });

        await lockApi.releaseAllLocks({ owner: 'owner1' });

        expect((await lockApi.hasLock({ owner: 'owner2', key: 'reassigned' })).unwrap()).toBe(true);
    });
});
