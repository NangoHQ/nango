import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Locking } from './locking';
import { InMemoryKVStore } from '../kvstore/InMemoryStore';

describe('Locking', () => {
    let store: InMemoryKVStore;
    let locking: Locking;
    let KEY = 'key';

    beforeAll(async () => {
        store = new InMemoryKVStore();
        locking = new Locking(store);
    });

    beforeEach(async () => {
        store.delete(KEY);
    });

    it('should acquire and release a lock', async () => {
        await locking.acquire(KEY, 1000);
        await locking.release(KEY);
    });

    it('should throws an error if ttlInMs is not positive', async () => {
        await expect(locking.acquire(KEY, 0)).rejects.toEqual(new Error(`lock's TTL must be greater than 0`));
        await expect(locking.tryAcquire(KEY, 0, 10000)).rejects.toThrowError(`lock's TTL must be greater than 0`);
    });

    it('should prevents acquisition of existing lock', async () => {
        await locking.acquire(KEY, 1000);
        await expect(locking.acquire(KEY, 1000)).rejects.toThrowError('Failed to acquire lock for key: key');
    });

    it('should aquire an expired lock', async () => {
        await locking.acquire(KEY, 200);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await locking.acquire(KEY, 200);
    });

    it('should wait and acquire a expired lock', async () => {
        await locking.acquire(KEY, 1000);
        await expect(locking.tryAcquire(KEY, 200, 2000)).resolves.not.toThrow();
    });

    it('should wait and acquire a released lock', async () => {
        await locking.acquire(KEY, 1000);
        setTimeout(() => {
            locking.release(KEY);
        }, 500);
        await expect(locking.tryAcquire(KEY, 200, 1000)).resolves.not.toThrow();
    });
});
