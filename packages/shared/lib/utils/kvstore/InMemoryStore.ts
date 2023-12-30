import type { KVStore } from './KVStore';

interface Value {
    value: string;
    timestamp: number;
    ttlInMs: number;
}

export class InMemoryKVStore implements KVStore {
    private store: Map<string, Value>;

    constructor() {
        this.store = new Map();
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

    public async set(key: string, value: string, canOverride: boolean = true, ttlInMs: number = 0): Promise<void> {
        const res = this.store.get(key);
        const isExpired = res && this.isExpired(res);
        if (isExpired || canOverride || res === undefined) {
            this.store.set(key, { value: value, timestamp: Date.now(), ttlInMs: ttlInMs });
            return Promise.resolve();
        }
        return Promise.reject('Key already exists');
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
}
