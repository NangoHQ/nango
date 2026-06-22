import type { KVStore } from './KVStore.js';

export interface Lock {
    readonly key: string;
}

export class Locking {
    private store: KVStore;

    constructor(store: KVStore) {
        this.store = store;
    }

    public async tryAcquire(key: string, ttlMs: number, acquisitionTimeoutMs: number): Promise<Lock> {
        if (ttlMs <= 0) {
            throw new Error(`lock's TTL must be greater than 0`);
        }
        if (acquisitionTimeoutMs <= 0) {
            throw new Error(`acquisitionTimeoutMs must be greater than 0`);
        }

        const start = Date.now();
        while (Date.now() - start < acquisitionTimeoutMs) {
            try {
                await this.acquire(key, ttlMs);
                return { key };
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        throw new Error(`Acquiring lock for key: ${key} timed out after ${acquisitionTimeoutMs}ms`);
    }

    public async acquire(key: string, ttlMs: number): Promise<Lock> {
        if (ttlMs <= 0) {
            throw new Error(`lock's TTL must be greater than 0`);
        }
        try {
            await this.store.set(key, '1', { canOverride: false, ttlMs: ttlMs });
        } catch (err) {
            throw new Error(`Failed to acquire lock for key: ${key}`, { cause: err });
        }
        return { key };
    }

    public async releaseAll(prefix: string): Promise<void> {
        for await (const key of this.store.scan(`${prefix}:*`)) {
            await this.store.delete(key);
        }
    }

    public async release(lock: Lock): Promise<void> {
        try {
            await this.store.delete(lock.key);
        } catch (err) {
            throw new Error(`Failed to release lock for key: ${lock.key}`, { cause: err });
        }
    }

    public async hasLock(key: string): Promise<boolean> {
        return await this.store.exists(key);
    }
}
