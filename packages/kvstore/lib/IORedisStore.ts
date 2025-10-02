import type { KVStoreRedis, RedisClient } from './KVStore.js';
import type { Redis } from 'ioredis';

export class IORedisKVStore implements KVStoreRedis {
    private client: Redis;

    public getClient(): RedisClient {
        return this.client;
    }

    constructor(client: Redis) {
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

    public async incr(key: string, opts?: { ttlInMs?: number; delta?: number }): Promise<number> {
        const multi = this.client.multi();
        multi.incrby(key, opts?.delta || 1);
        if (opts?.ttlInMs) {
            multi.pexpire(key, opts.ttlInMs);
        }
        const results = await multi.exec();
        if (!results || results.length === 0) {
            throw new Error('Transaction failed');
        }
        const [count] = results;
        if (!count || count.length < 2) {
            throw new Error('Transaction result invalid');
        }
        return count[1] as number;
    }

    public async *scan(pattern: string): AsyncGenerator<string> {
        const stream = this.client.scanStream({
            match: pattern
        });

        for await (const keys of stream) {
            for (const key of keys) {
                yield key;
            }
        }
    }

    public async publish(channel: string, message: string): Promise<void> {
        await this.client.publish(channel, message);
    }

    public async subscribe(channel: string, onMessage: (message: string, channel: string) => void): Promise<void> {
        await this.client.subscribe(channel);
        this.client.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                onMessage(message, receivedChannel);
            }
        });
    }

    public async unsubscribe(channel: string): Promise<void> {
        await this.client.unsubscribe(channel);
    }
}
