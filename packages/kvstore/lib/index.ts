import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { InMemoryKVStore } from './InMemoryStore.js';
import { RedisKVStore } from './RedisStore.js';

export { InMemoryKVStore } from './InMemoryStore.js';
export { RedisKVStore } from './RedisStore.js';
export type { KVStore } from './KVStore.js';
export { FeatureFlags } from './FeatureFlags.js';
export type { RedisClientType } from 'redis';

export const redisURL = process.env['NANGO_REDIS_URL'];
let kvStore: RedisKVStore | InMemoryKVStore | undefined;
export async function createKVStore() {
    if (kvStore) {
        return kvStore;
    }

    if (redisURL) {
        kvStore = new RedisKVStore(redisURL);
        await kvStore.connect();
    } else {
        kvStore = new InMemoryKVStore();
    }
    return kvStore;
}

let redisClient: RedisClientType | undefined;
export function createRedisClient({ url = redisURL, cache = true }: { url?: string; cache?: boolean } = {}): RedisClientType {
    if (!url) {
        throw new Error('NANGO_REDIS_URL is required');
    }
    if (!cache) {
        return createClient({ url: url });
    }

    if (redisClient) {
        return redisClient;
    }
    redisClient = createClient({ url: url });
    return redisClient;
}
