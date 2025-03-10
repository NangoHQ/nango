import { stringifyError } from '@nangohq/utils';
import type { KVStore } from './KVStore.js';

export interface Lock {
    readonly key: string;
}

export class Locking {
    private store: KVStore;

    constructor(store: KVStore) {
        this.store = store;
    }

    public async tryAcquire(key: string, ttlInMs: number, acquisitionTimeoutMs: number): Promise<Lock> {
        if (ttlInMs <= 0) {
            throw new Error(`lock's TTL must be greater than 0`);
        }
        if (acquisitionTimeoutMs <= 0) {
            throw new Error(`acquisitionTimeoutMs must be greater than 0`);
        }

        const start = Date.now();
        while (Date.now() - start < acquisitionTimeoutMs) {
            try {
                await this.acquire(key, ttlInMs);
                return { key };
            } catch {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        throw new Error(`Acquiring lock for key: ${key} timed out after ${acquisitionTimeoutMs}ms`);
    }

    public async acquire(key: string, ttlInMs: number): Promise<Lock> {
        if (ttlInMs <= 0) {
            throw new Error(`lock's TTL must be greater than 0`);
        }
        try {
            await this.store.set(key, '1', { canOverride: false, ttlInMs });
        } catch (err) {
            throw new Error(`Failed to acquire lock for key: ${key} ${stringifyError(err)}`);
        }
        return { key };
    }

    public async release(lock: Lock): Promise<void> {
        await this.store.delete(lock.key);
    }
}
