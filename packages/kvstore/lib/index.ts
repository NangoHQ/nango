import { Redis } from 'ioredis';

import { FeatureFlags } from './FeatureFlags.js';
import { IORedisKVStore } from './IORedisStore.js';
import { InMemoryKVStore } from './InMemoryStore.js';
import { Locking } from './Locking.js';
import { RedisKVStore } from './RedisStore.js';
import { getIORedis, getNodeRedis } from './utils.js';

import type { KVStore, RedisClient } from './KVStore.js';

export { InMemoryKVStore } from './InMemoryStore.js';
export { FeatureFlags } from './FeatureFlags.js';
export { RedisKVStore } from './RedisStore.js';
export type { KVStore, KVStoreRedis } from './KVStore.js';
export { type Lock, Locking } from './Locking.js';

// Those getters can be accessed at any point so we store the promise to avoid race condition
// Not my best code
let redis: RedisClient;
export function getRedis(url: string): RedisClient {
    if (redis) {
        return redis;
    }
    const clientLibrary = process.env['NANGO_REDIS_CLIENT_LIBRARY'] || 'node-redis';
    switch (clientLibrary) {
        case 'node-redis':
            redis = getNodeRedis(url);
            break;
        case 'ioredis':
            redis = getIORedis(url);
            break;
    }
    return redis;
}

async function getRedisKVStore(url: string, connect: boolean = true): Promise<KVStore> {
    const redis = getRedis(url);
    redis.on('error', (err) => {
        console.error(`Redis (kvstore) error: ${err}`);
    });
    redis.on('connect', () => {
        console.log('Redis (kvstore) connected');
    });
    if (redis instanceof Redis) return new IORedisKVStore(redis);
    if (connect) await redis.connect();
    return new RedisKVStore(redis);
}

export async function destroy() {
    if (kvstorePromise) {
        await (await kvstorePromise).destroy();
        kvstorePromise = undefined;
    }
    if (redis) {
        await redis.disconnect();
    }
}

async function createKVStore(url: string | undefined, connect: boolean = true): Promise<KVStore> {
    if (url) {
        const store = await getRedisKVStore(url, connect);
        return store;
    } else {
        const endpoint = process.env['NANGO_REDIS_HOST'];
        const port = process.env['NANGO_REDIS_PORT'] || 6379;
        const auth = process.env['NANGO_REDIS_AUTH'];
        if (endpoint && port && auth) {
            const store = await getRedisKVStore(`rediss://:${auth}@${endpoint}:${port}`, connect);
            return store;
        }
    }

    return new InMemoryKVStore();
}

let kvstorePromise: Promise<KVStore> | undefined;
export async function getKVStore(url: string | undefined = process.env['NANGO_REDIS_URL'], connect: boolean = true): Promise<KVStore> {
    if (kvstorePromise) {
        return await kvstorePromise;
    }

    kvstorePromise = createKVStore(url, connect);
    return await kvstorePromise;
}

let featureFlags: Promise<FeatureFlags> | undefined;
export async function getFeatureFlagsClient(): Promise<FeatureFlags> {
    if (featureFlags) {
        return await featureFlags;
    }

    featureFlags = (async () => {
        const store = await getKVStore();
        return new FeatureFlags(store);
    })();
    return await featureFlags;
}

let locking: Promise<Locking> | undefined;
export async function getLocking(): Promise<Locking> {
    if (locking) {
        return await locking;
    }

    locking = (async () => {
        const store = await getKVStore();
        return new Locking(store);
    })();
    return await locking;
}
