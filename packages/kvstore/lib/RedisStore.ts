import type { KVStore } from './KVStore.js';
import type { RedisClientType } from 'redis';

export class RedisKVStore implements KVStore {
    protected client: RedisClientType;

    constructor(client: RedisClientType) {
        this.client = client;
    }

    public async destroy(): Promise<void> {
        // Do nothing because the client is shared across other class
    }

    public async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    public async set(key: string, value: string, opts?: { canOverride?: boolean; ttlMs?: number }): Promise<void> {
        const options: any = {};
        if (opts) {
            if (opts.ttlMs && opts.ttlMs > 0) {
                options['PX'] = opts.ttlMs;
            }
            if (opts.canOverride === false) {
                options['NX'] = true;
            }
        }
        const res = await this.client.set(key, value, options);
        if (res !== 'OK') {
            throw new Error(`set_key_already_exists`);
        }
    }

    public async exists(key: string): Promise<boolean> {
        return (await this.client.exists(key)) > 0;
    }

    public async delete(key: string): Promise<void> {
        await this.client.del(key);
    }

    public async incr(key: string, opts?: { ttlMs?: number; delta?: number }): Promise<number> {
        const multi = this.client.multi();
        multi.incrBy(key, opts?.delta || 1);
        if (opts?.ttlMs) {
            multi.pExpire(key, opts.ttlMs);
        }
        const [count] = await multi.exec();
        return count as number;
    }

    public async *scan(pattern: string): AsyncGenerator<string> {
        for await (const key of this.client.scanIterator({
            MATCH: pattern
        })) {
            yield key;
        }
    }

    public async hSetAll(key: string, value: Record<string, string>, opts: { canOverride?: boolean; ttlMs?: number } = {}): Promise<void> {
        if (opts.canOverride !== true) {
            const exists = await this.client.exists(key);
            if (exists) {
                throw new Error(`hSetAll_key_already_exists`);
            }
        }
        const multi = this.client.multi();
        multi.hSet(key, value);
        if (opts.ttlMs && opts.ttlMs > 0) {
            multi.pExpire(key, opts.ttlMs);
        }
        const [res] = await multi.exec();
        if (res === 0) {
            throw new Error(`hSetAll_failed`);
        }
    }

    public async hSet(key: string, field: string, value: string, opts: { canOverride?: boolean } = {}): Promise<void> {
        if (opts.canOverride !== true) {
            const exists = await this.client.hExists(key, field);
            if (exists) {
                throw new Error(`hSet_field_already_exists`);
            }
        }
        const res = await this.client.hSet(key, field, value);
        if (res === 0) {
            throw new Error(`hSet_failed`);
        }
    }

    public async hGetAll(key: string): Promise<Record<string, string> | null> {
        const res = await this.client.hGetAll(key);
        return Object.keys(res).length > 0 ? res : null;
    }

    public async hGet(key: string, field: string): Promise<string | null> {
        const res = await this.client.hGet(key, field);
        return res || null;
    }

    public async hIncrBy(key: string, field: string, delta: number): Promise<number> {
        return this.client.hIncrBy(key, field, delta);
    }
}
