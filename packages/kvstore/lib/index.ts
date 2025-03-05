import type { RedisClientType } from 'redis';
import { createClient } from 'redis';
import { FeatureFlags } from './FeatureFlags.js';
import { InMemoryKVStore } from './InMemoryStore.js';
import type { KVStore } from './KVStore.js';
import { RedisKVStore } from './RedisStore.js';

export { InMemoryKVStore } from './InMemoryStore.js';
export { FeatureFlags } from './FeatureFlags.js';
export { RedisKVStore } from './RedisStore.js';
export type { KVStore } from './KVStore.js';

// Those getters can be accessed at any point so we store the promise to avoid race condition
// Not my best code

let redis: RedisClientType | undefined;
async function getRedis(url: string): Promise<RedisClientType> {
    if (redis) {
        return redis;
    }
    redis = createClient({ url });

    redis.on('error', (err) => {
        // TODO: report error
        console.error(`Redis (kvstore) error: ${err}`);
    });

    await redis.connect().then(() => {
        // do nothing
    });

    return redis;
}

export async function destroy() {
    if (kvstorePromise) {
        await (await kvstorePromise).destroy();
    }
    if (redis) {
        await redis.disconnect();
    }
}

async function createKVStore() {
    const url = process.env['NANGO_REDIS_URL'];
    if (url) {
        const store = new RedisKVStore(await getRedis(url));
        return store;
    }

    return new InMemoryKVStore();
}

let kvstorePromise: Promise<KVStore> | undefined;
export async function getKVStore(): Promise<KVStore> {
    if (kvstorePromise) {
        return await kvstorePromise;
    }

    kvstorePromise = createKVStore();
    return await kvstorePromise;
}

let featureFlags: Promise<FeatureFlags> | undefined;
export async function getFeatureFlagsClient(): Promise<FeatureFlags> {
    if (featureFlags) {
        return await featureFlags;
    }

    const store = await getKVStore();
    featureFlags = Promise.resolve(new FeatureFlags(store));
    return await featureFlags;
}
