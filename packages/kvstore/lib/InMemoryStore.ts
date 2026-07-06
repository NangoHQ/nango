import type { KVStore } from './KVStore.js';

interface StringEntry {
    kind: 'string';
    value: string;
    timestamp: number;
    ttlMs: number;
}
interface SetEntry {
    kind: 'set';
    members: Set<string>;
    timestamp: number;
    ttlMs: number;
}
type Entry = StringEntry | SetEntry; // one key -> one type, like Redis
const KVSTORE_INTERVAL_CLEANUP = 10000;

export class InMemoryKVStore implements KVStore {
    private store: Map<string, Entry>;
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
        if (res === undefined || res.kind !== 'string') {
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
            this.store.set(key, { kind: 'string', value: value, timestamp: Date.now(), ttlMs: opts?.ttlMs || 0 });
            return Promise.resolve();
        }
        return Promise.reject(new Error('set_key_already_exists'));
    }

    public async setIfValueEquals(key: string, expectedValue: string, newValue: string, ttlMs: number): Promise<boolean> {
        const res = this.store.get(key);
        if (res === undefined || res.kind !== 'string' || this.isExpired(res)) {
            return Promise.resolve(false);
        }
        if (res.value !== expectedValue) {
            return Promise.resolve(false);
        }
        this.store.set(key, { kind: 'string', value: newValue, timestamp: Date.now(), ttlMs });
        return Promise.resolve(true);
    }

    public async deleteIfValueEquals(key: string, expectedValue: string): Promise<boolean> {
        const res = this.store.get(key);
        if (res === undefined || res.kind !== 'string' || this.isExpired(res)) {
            return Promise.resolve(false);
        }
        if (res.value !== expectedValue) {
            return Promise.resolve(false);
        }
        this.store.delete(key);
        return Promise.resolve(true);
    }

    public async delete(key: string): Promise<void> {
        this.store.delete(key);
        return Promise.resolve();
    }

    public async exists(key: string): Promise<boolean> {
        return Promise.resolve(this.store.has(key));
    }

    private isExpired(value: { timestamp: number; ttlMs: number }): boolean {
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
        const current = res && res.kind === 'string' && !this.isExpired(res) ? res.value : null;
        const nextVal = current !== null ? String(parseInt(current, 10) + (opts?.delta || 1)) : '1';
        this.store.set(key, { kind: 'string', value: nextVal, timestamp: Date.now(), ttlMs: opts?.ttlMs || 0 });
        return Promise.resolve(Number(nextVal));
    }

    public async sAdd(key: string, member: string, opts?: { ttlMs?: number }): Promise<void> {
        const existing = this.store.get(key);
        const entry: SetEntry =
            existing?.kind === 'set' && !this.isExpired(existing) ? existing : { kind: 'set', members: new Set<string>(), timestamp: Date.now(), ttlMs: 0 };
        entry.members.add(member);
        if (opts?.ttlMs) {
            // Extend-only: never shrink the set below its longest-lived member.
            const now = Date.now();
            const newExpiry = now + opts.ttlMs;
            const currentExpiry = entry.ttlMs > 0 ? entry.timestamp + entry.ttlMs : 0; // 0 = no expiry yet
            if (newExpiry > currentExpiry) {
                entry.timestamp = now;
                entry.ttlMs = opts.ttlMs;
            }
        }
        this.store.set(key, entry);
        return Promise.resolve();
    }

    public async sMembers(key: string): Promise<string[]> {
        const entry = this.store.get(key);
        if (entry === undefined || entry.kind !== 'set' || this.isExpired(entry)) {
            if (entry?.kind === 'set') {
                this.store.delete(key);
            }
            return Promise.resolve([]);
        }
        return Promise.resolve(Array.from(entry.members));
    }
}
