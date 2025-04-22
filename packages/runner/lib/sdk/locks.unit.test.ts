import { beforeEach, describe, expect, it } from 'vitest';

import { Locks } from './locks.js';

describe('Locks', () => {
    let locks: Locks;

    beforeEach(() => {
        locks = new Locks();
    });
    describe('tryAcquireLock input validation', () => {
        it('should fail to acquire a lock with an empty key', async () => {
            const res = await locks.tryAcquireLock({ owner: 'owner1', key: '', ttlMs: 1000 });
            if (res.isOk()) {
                throw new Error('Expected an error: empty key');
            }
        });
        it('should fail to acquire a lock with a key longer than 255 characters', async () => {
            const longKey = 'a'.repeat(256);
            const res = await locks.tryAcquireLock({ owner: 'owner1', key: longKey, ttlMs: 1000 });
            if (res.isOk()) {
                throw new Error('Expected an error: key too long');
            }
        });
        it('should fail to acquire a lock with an empty owner', async () => {
            const res = await locks.tryAcquireLock({ owner: '', key: 'resource1', ttlMs: 1000 });
            if (res.isOk()) {
                throw new Error('Expected an error: empty owner');
            }
        });
        it('should fail to acquire a lock with an owner longer than 255 characters', async () => {
            const longOwner = 'a'.repeat(256);
            const res = await locks.tryAcquireLock({ owner: longOwner, key: 'resource1', ttlMs: 1000 });
            if (res.isOk()) {
                throw new Error('Expected an error: owner too long');
            }
        });
        it('should fail to acquire a lock with a TTL less than or equal to 0', async () => {
            const res = await locks.tryAcquireLock({ owner: 'owner', key: 'resource1', ttlMs: 0 });
            if (res.isOk()) {
                throw new Error('Expected an error: ttl = 0');
            }
        });
    });

    describe('tryAcquireLock', () => {
        it('should successfully acquire a lock when none exists', async () => {
            const res = await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1000 });
            expect(res.unwrap()).toBe(true);
        });

        it('should fail to acquire a lock that is already held and not expired', async () => {
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1000 });

            const res = await locks.tryAcquireLock({ owner: 'owner2', key: 'resource1', ttlMs: 1000 });
            expect(res.unwrap()).toBe(false);
        });

        it('should successfully acquire a lock that is own by the same owner, regardless of the expiration', async () => {
            const owner = 'owner1';
            await locks.tryAcquireLock({ owner, key: 'resource1', ttlMs: 1000 });
            const res = await locks.tryAcquireLock({ owner, key: 'resource1', ttlMs: 1000 });
            expect(res.unwrap()).toBe(true);
        });

        it('should successfully acquire an expired lock', async () => {
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1 });
            await new Promise((resolve) => setTimeout(resolve, 2)); // Wait for the lock to expire

            const res = await locks.tryAcquireLock({ owner: 'owner2', key: 'resource1', ttlMs: 1000 });
            expect(res.unwrap()).toBe(true);
        });

        it('should ensure only one owner acquires the lock when called concurrently', async () => {
            const concurrency = 100_000;
            const attempts = Array.from({ length: concurrency }, (_, i) =>
                locks.tryAcquireLock({ owner: `owner${i}`, key: 'concurrent-resource', ttlMs: 10000 })
            );

            const res = await Promise.all(attempts);
            const successCount = res.filter((acquired) => acquired.unwrap()).length;
            expect(successCount).toBe(1);
        });
    });

    describe('releaseLock', () => {
        it('should successfully release a lock owned by the requester', async () => {
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1000 });
            const res = await locks.releaseLock({ owner: 'owner1', key: 'resource1' });
            expect(res.unwrap()).toBe(true);
        });

        it('should not release a lock owned by someone else', async () => {
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1000 });
            const res = await locks.releaseLock({ owner: 'owner2', key: 'resource1' });
            expect(res.unwrap()).toBe(false);
        });

        it('should not release a non-existent lock', async () => {
            const res = await locks.releaseLock({ owner: 'owner1', key: 'nonExisting' });
            expect(res.unwrap()).toBe(false);
        });
    });

    describe('releaseAllLocks', () => {
        it('should release all locks owned by the requester', async () => {
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1000 });
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource2', ttlMs: 1000 });
            await locks.tryAcquireLock({ owner: 'owner2', key: 'resource3', ttlMs: 1000 });

            await locks.releaseAllLocks({ owner: 'owner1' });

            const res1 = await locks.hasLock({ owner: 'owner1', key: 'resource1' });
            expect(res1.unwrap()).toBe(false); // released

            const res2 = await locks.hasLock({ owner: 'owner1', key: 'resource2' });
            expect(res2.unwrap()).toBe(false); // released

            const res3 = await locks.hasLock({ owner: 'owner2', key: 'resource3' });
            expect(res3.unwrap()).toBe(true); // still owned by owner2
        });
    });

    describe('hasLock', () => {
        it('should return true if the lock is held by the specified owner', async () => {
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1000 });
            const res = await locks.hasLock({ owner: 'owner1', key: 'resource1' });
            expect(res.unwrap()).toBe(true);
        });

        it('should return false if the lock is held by a different owner', async () => {
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1000 });
            const res = await locks.hasLock({ owner: 'owner2', key: 'resource1' });
            expect(res.unwrap()).toBe(false);
        });

        it('should return false if the lock does not exist', async () => {
            const res = await locks.hasLock({ owner: 'owner1', key: 'nonExisting' });
            expect(res.unwrap()).toBe(false);
        });

        it('should return false if the locks is expired', async () => {
            await locks.tryAcquireLock({ owner: 'owner1', key: 'resource1', ttlMs: 1 });
            await new Promise((resolve) => setTimeout(resolve, 10)); // Wait for the lock to expire

            const res = await locks.hasLock({ owner: 'owner1', key: 'resource1' });
            expect(res.unwrap()).toBe(false);
        });
    });
});
