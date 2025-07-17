import type { KVStore } from './KVStore.js';
import type { RedisClientType } from 'redis';

export class RedisKVStore implements KVStore {
    private client: RedisClientType;

    constructor(client: RedisClientType) {
        this.client = client;
    }

    public async destroy(): Promise<void> {
        // Do nothing because the client is shared across other class
    }

    public async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    public async set(key: string, value: string, opts?: { canOverride?: boolean; ttlInMs?: number }): Promise<void> {
        const options: any = {};
        if (opts) {
            if (opts.ttlInMs && opts.ttlInMs > 0) {
                options['PX'] = opts.ttlInMs;
            }
            if (opts.canOverride === false) {
                options['NX'] = true;
            }
        }
        const res = await this.client.set(key, value, options);
        if (res !== 'OK') {
            throw new Error(`Failed to set key: ${key}, value: ${value}, ${JSON.stringify(options)}`);
        }
    }

    public async exists(key: string): Promise<boolean> {
        return (await this.client.exists(key)) > 0;
    }

    public async delete(key: string): Promise<void> {
        await this.client.del(key);
    }

    public async incr(key: string, opts?: { ttlInMs?: number }): Promise<number> {
        const multi = this.client.multi();
        multi.incrBy(key, 1);
        if (opts?.ttlInMs) {
            multi.pExpire(key, opts.ttlInMs);
        }
        const [count] = await multi.exec();
        return count as number;
    }
}
