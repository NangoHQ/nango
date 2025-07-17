import type { KVStore } from './KVStore.js';
import type { MaybePromise } from '@nangohq/types';

interface Value {
    value: string;
    timestamp: number;
    ttlInMs: number;
}
const KVSTORE_INTERVAL_CLEANUP = 10000;

export class InMemoryKVStore implements KVStore {
    private store: Map<string, Value>;
    private interval: NodeJS.Timeout;

    constructor() {
        this.store = new Map();
        this.interval = setTimeout(() => this.clearExpired(), KVSTORE_INTERVAL_CLEANUP);
    }

    destroy(): MaybePromise<void> {
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.store.clear();
    }

    public async get(key: string): Promise<string | null> {
        const res = this.store.get(key);
        if (res === undefined) {
            return null;
        }
        if (this.isExpired(res)) {
            this.store.delete(key);
            return null;
        }
        return Promise.resolve(res.value);
    }

    public async set(key: string, value: string, opts?: { canOverride?: boolean; ttlInMs?: number }): Promise<void> {
        const res = this.store.get(key);
        const isExpired = res && this.isExpired(res);
        if (isExpired || opts?.canOverride || res === undefined) {
            this.store.set(key, { value: value, timestamp: Date.now(), ttlInMs: opts?.ttlInMs || 0 });
            return Promise.resolve();
        }
        return Promise.reject(new Error('Key already exists'));
    }

    public async delete(key: string): Promise<void> {
        this.store.delete(key);
        return Promise.resolve();
    }

    public async exists(key: string): Promise<boolean> {
        return Promise.resolve(this.store.has(key));
    }

    private isExpired(value: Value): boolean {
        if (value.ttlInMs > 0 && value.timestamp + value.ttlInMs < Date.now()) {
            return true;
        }
        return false;
    }

    private clearExpired() {
        for (const [key, value] of this.store) {
            if (this.isExpired(value)) {
                this.store.delete(key);
            }
        }
        this.interval = setTimeout(() => this.clearExpired(), KVSTORE_INTERVAL_CLEANUP);
    }

    public incr(key: string, opts?: { ttlInMs?: number }) {
        const res = this.store.get(key);

        const nextVal = res ? String(parseInt(res.value, 10) + 1) : '1';
        this.store.set(key, { value: nextVal, timestamp: Date.now(), ttlInMs: opts?.ttlInMs || 0 });

        return Number(nextVal);
    }
}
