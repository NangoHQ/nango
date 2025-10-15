import type { KVStore } from './KVStore.js';

interface Value {
    value: string;
    timestamp: number;
    ttlMs: number;
}
const KVSTORE_INTERVAL_CLEANUP = 10000;

export class InMemoryKVStore implements KVStore {
    private store: Map<string, Value>;
    private interval: NodeJS.Timeout;

    constructor() {
        this.store = new Map();
        this.interval = setTimeout(() => this.clearExpired(), KVSTORE_INTERVAL_CLEANUP);
    }

    async destroy(): Promise<void> {
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.store.clear();
        return Promise.resolve();
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

    public async set(key: string, value: string, opts?: { canOverride?: boolean; ttlMs?: number }): Promise<void> {
        const res = this.store.get(key);
        const isExpired = res && this.isExpired(res);
        if (isExpired || opts?.canOverride || res === undefined) {
            this.store.set(key, { value: value, timestamp: Date.now(), ttlMs: opts?.ttlMs || 0 });
            return Promise.resolve();
        }
        return Promise.reject(new Error('set_key_already_exists'));
    }

    public async delete(key: string): Promise<void> {
        this.store.delete(key);
        return Promise.resolve();
    }

    public async exists(key: string): Promise<boolean> {
        return Promise.resolve(this.store.has(key));
    }

    private isExpired(value: Value): boolean {
        if (value.ttlMs > 0 && value.timestamp + value.ttlMs < Date.now()) {
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

    public async incr(key: string, opts?: { ttlMs?: number; delta?: number }): Promise<number> {
        const res = this.store.get(key);

        const nextVal = res && !this.isExpired(res) ? String(parseInt(res.value, 10) + (opts?.delta || 1)) : '1';
        this.store.set(key, { value: nextVal, timestamp: Date.now(), ttlMs: opts?.ttlMs || 0 });

        return Promise.resolve(Number(nextVal));
    }

    // eslint-disable-next-line @typescript-eslint/require-await
    public async *scan(pattern: string): AsyncGenerator<string> {
        for (const key of this.store.keys()) {
            if (this.matchesPattern(key, pattern)) {
                yield key;
            }
        }
    }

    // AI generated - works well for `usage:*:something:*`
    private matchesPattern(key: string, pattern: string): boolean {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special characters
            .replace(/\\\*/g, '.*'); // Convert escaped * to .*

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(key);
    }
}
