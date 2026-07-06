import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryKVStore } from '@nangohq/kvstore';

import * as locks from './locks.js';

import type { KVStore } from '@nangohq/kvstore';

const namespace = 1;

function createLocks(store: KVStore) {
    return {
        tryAcquireLock: (params: { owner: string; key: string; ttlMs: number; namespace?: number }) =>
            locks.tryAcquireLock(store, { namespace: params.namespace ?? namespace, owner: params.owner, key: params.key, ttlMs: params.ttlMs }),
        releaseLock: (params: { owner: string; key: string; namespace?: number }) =>
            locks.releaseLock(store, { namespace: params.namespace ?? namespace, owner: params.owner, key: params.key }),
        releaseAllLocks: (params: { owner: string; namespace?: number }) =>
            locks.releaseAllLocks(store, { namespace: params.namespace ?? namespace, owner: params.owner }),
        hasLock: (params: { owner: string; key: string; namespace?: number }) =>
            locks.hasLock(store, { namespace: params.namespace ?? namespace, owner: params.owner, key: params.key })
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
        expect((await lockApi.tryAcquireLock({ owner: 'owner1', key: 'reassigned', ttlMs: 100 })).unwrap()).toBe(true);
        expect((await lockApi.tryAcquireLock({ owner: 'owner1', key: 'keepalive', ttlMs: 100_000 })).unwrap()).toBe(true);

        vi.advanceTimersByTime(101);
        expect((await lockApi.tryAcquireLock({ owner: 'owner2', key: 'reassigned', ttlMs: 100_000 })).unwrap()).toBe(true);

        await lockApi.releaseAllLocks({ owner: 'owner1' });

        expect((await lockApi.hasLock({ owner: 'owner2', key: 'reassigned' })).unwrap()).toBe(true);
    });

    it('isolates locks with the same owner and key across namespaces', async () => {
        const lockApi = createLocks(store);
        expect((await lockApi.tryAcquireLock({ namespace: 1, owner: 'owner1', key: 'shared', ttlMs: 10_000 })).unwrap()).toBe(true);
        expect((await lockApi.tryAcquireLock({ namespace: 2, owner: 'owner1', key: 'shared', ttlMs: 10_000 })).unwrap()).toBe(true);

        expect((await lockApi.hasLock({ namespace: 1, owner: 'owner1', key: 'shared' })).unwrap()).toBe(true);
        expect((await lockApi.hasLock({ namespace: 2, owner: 'owner1', key: 'shared' })).unwrap()).toBe(true);

        expect((await lockApi.releaseLock({ namespace: 1, owner: 'owner1', key: 'shared' })).unwrap()).toBe(true);
        expect((await lockApi.hasLock({ namespace: 1, owner: 'owner1', key: 'shared' })).unwrap()).toBe(false);
        expect((await lockApi.hasLock({ namespace: 2, owner: 'owner1', key: 'shared' })).unwrap()).toBe(true);
    });
});
