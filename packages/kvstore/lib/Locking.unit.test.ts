import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryKVStore } from './InMemoryStore.js';
import { Locking } from './Locking.js';

describe('Locking', () => {
    let store: InMemoryKVStore;
    let locking: Locking;
    const KEY = 'key';

    beforeAll(() => {
        store = new InMemoryKVStore();
        locking = new Locking(store);
    });

    beforeEach(() => {
        store.delete(KEY);
    });

    it('should acquire and release a lock', async () => {
        const lock = await locking.acquire(KEY, 1000);
        await locking.release(lock);
    });

    it('should throws an error if ttlInMs is not positive', async () => {
        await expect(locking.acquire(KEY, 0)).rejects.toEqual(new Error(`lock's TTL must be greater than 0`));
        await expect(locking.tryAcquire(KEY, 0, 10000)).rejects.toThrowError(`lock's TTL must be greater than 0`);
    });

    it('should prevents acquisition of existing lock', async () => {
        await locking.acquire(KEY, 1000);
        await expect(locking.acquire(KEY, 1000)).rejects.toThrowError('Failed to acquire lock for key: key');
    });

    it('should acquire an expired lock', async () => {
        await locking.acquire(KEY, 200);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await locking.acquire(KEY, 200);
    });

    it('should wait and acquire a expired lock', async () => {
        await locking.acquire(KEY, 1000);
        await expect(locking.tryAcquire(KEY, 200, 2000)).resolves.not.toThrow();
    });

    it('should wait and acquire a released lock', async () => {
        const lock = await locking.acquire(KEY, 1000);
        setTimeout(() => {
            locking.release(lock);
        }, 500);
        await expect(locking.tryAcquire(KEY, 200, 1000)).resolves.not.toThrow();
    });

    it('should acquire and release a lock with tryRelease', async () => {
        const lock = await locking.acquire(KEY, 1000);
        await locking.tryRelease(lock, 1000);
    });

    it('should throw an error if releaseTimeoutMs is not positive', async () => {
        const lock = await locking.acquire(KEY, 1000);
        await expect(locking.tryRelease(lock, 0)).rejects.toThrowError(`releaseTimeoutMs must be greater than 0`);
    });

    it('should retry and release a lock after transient failures', async () => {
        let deleteAttempts = 0;
        const originalDelete = store.delete.bind(store);
        vi.spyOn(store, 'delete').mockImplementation(async (key: string) => {
            deleteAttempts++;
            if (deleteAttempts < 3) {
                throw new Error('transient redis error');
            }
            return originalDelete(key);
        });
        const lock = await locking.acquire(KEY, 1000);
        await locking.tryRelease(lock, 1000);
        expect(deleteAttempts).toBe(3);
        vi.restoreAllMocks();
    });
});
