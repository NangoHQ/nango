import type { KVStore } from '../kvstore/KVStore.js';

export class Locking {
    private store: KVStore;

    constructor(store: KVStore) {
        this.store = store;
    }

    public async tryAcquire(key: string, ttlInMs: number, acquitistionTimeoutMs: number): Promise<void> {
        if (ttlInMs <= 0) {
            throw new Error(`lock's TTL must be greater than 0`);
        }
        if (acquitistionTimeoutMs <= 0) {
            throw new Error(`acquitistionTimeoutMs must be greater than 0`);
        }
        const start = Date.now();
        while (Date.now() - start < acquitistionTimeoutMs) {
            try {
                await this.acquire(key, ttlInMs);
                return;
            } catch (e) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        throw new Error(`Acquiring lock for key: ${key} timed out after ${acquitistionTimeoutMs}ms`);
    }

    public async acquire(key: string, ttlInMs: number): Promise<void> {
        if (ttlInMs <= 0) {
            throw new Error(`lock's TTL must be greater than 0`);
        }
        try {
            await this.store.set(key, '1', false, ttlInMs);
        } catch (e) {
            throw new Error(`Failed to acquire lock for key: ${key}`);
        }
    }

    public async release(key: string): Promise<void> {
        await this.store.delete(key);
    }
}
