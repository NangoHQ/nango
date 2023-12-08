import type { KVStore } from './KVStore';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

export class RedisKVStore implements KVStore {
    private client: RedisClientType;

    constructor(url: string) {
        this.client = createClient({ url: url });

        this.client.on('error', (err) => {
            console.error(`Redis (kvstore) error: ${err}`);
        });
    }

    public async connect(): Promise<void> {
        return this.client.connect().then(() => {});
    }

    public async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    public async set(key: string, value: string, canOverride: boolean = true, ttlInMs: number = 0): Promise<void> {
        let options: any = {};
        if (ttlInMs > 0) {
            options['PX'] = ttlInMs;
        }
        if (!canOverride) {
            options['NX'] = true;
        }
        const res = await this.client.set(key, value, options);
        if (res !== 'OK') {
            throw new Error(`Failed to set key: ${key}, value: ${value}, canOverride: ${canOverride}, ttlInMs: ${ttlInMs}`);
        }
    }

    public async exists(key: string): Promise<boolean> {
        return (await this.client.exists(key)) > 0;
    }

    public async delete(key: string): Promise<void> {
        await this.client.del(key);
    }
}
