import { Redis } from 'ioredis';

import { FeatureFlags } from './FeatureFlags.js';
import { IORedisKVStore } from './IORedisStore.js';
import { InMemoryKVStore } from './InMemoryStore.js';
import { Locking } from './Locking.js';
import { RedisKVStore } from './RedisStore.js';
import { getDefaultKVStoreOptions, getIORedis, getNodeRedis } from './utils.js';

import type { KVStore, KVStoreOptions, RedisClient } from './KVStore.js';

export { InMemoryKVStore } from './InMemoryStore.js';
export { FeatureFlags } from './FeatureFlags.js';
export { RedisKVStore } from './RedisStore.js';
export type { KVStore, KVStoreRedis } from './KVStore.js';
export { type Lock, Locking } from './Locking.js';

const defaultOptions = getDefaultKVStoreOptions();

// Those getters can be accessed at any point so we store the promise to avoid race condition
// Not my best code
const redisClients = new Map<string, RedisClient>();
function getRedis(options: KVStoreOptions): RedisClient {
    const name = options.name || 'default';
    if (redisClients.has(name)) {
        return redisClients.get(name)!;
    }
    const clientLibrary = options.clientLibrary || 'node-redis';
    switch (clientLibrary) {
        case 'node-redis':
            redisClients.set(name, getNodeRedis(options.url!));
            break;
        case 'ioredis':
            redisClients.set(name, getIORedis(options.url!));
            break;
        default:
            throw new Error(`Invalid Redis client library: ${clientLibrary}`);
    }
    return redisClients.get(name)!;
}

async function getRedisKVStore(options: KVStoreOptions): Promise<KVStore> {
    const redis = getRedis(options);
    redis.on('error', (err) => {
        console.error(`Redis (kvstore) error: ${err}`);
    });
    redis.on('connect', () => {
        console.log('Redis (kvstore) connected');
    });
    if (options.connect) {
        await redis.connect().then(() => {});
    }
    if (redis instanceof Redis) return new IORedisKVStore(redis);
    return new RedisKVStore(redis);
}

export async function destroyAll(hard: boolean = false) {
    for (const name of kvstorePromises.keys()) {
        await destroy(name, hard);
    }
    for (const name of redisClients.keys()) {
        await destroy(name, hard);
    }
}

export async function destroy(name: string, hard: boolean = false) {
    if (kvstorePromises.has(name)) {
        await (await kvstorePromises.get(name)!).destroy();
        if (hard) {
            kvstorePromises.delete(name);
            if (redisClients.has(name)) {
                redisClients.delete(name);
            }
        }
    }
}

async function createKVStore(options: KVStoreOptions): Promise<KVStore> {
    if (options.url) {
        const store = await getRedisKVStore(options);
        return store;
    } else {
        const endpoint = options.host;
        const port = options.port || 6379;
        const auth = options.auth;
        if (endpoint && port && auth) {
            const store = await getRedisKVStore({ url: `rediss://:${auth}@${endpoint}:${port}`, connect: options.connect! });
            return store;
        }
    }

    return new InMemoryKVStore();
}

const kvstorePromises = new Map<string, Promise<KVStore>>();
export async function getKVStore(options?: KVStoreOptions): Promise<KVStore> {
    const name = options?.name || 'default';
    if (kvstorePromises.has(name)) {
        return await kvstorePromises.get(name)!;
    }

    const kvstorePromise = createKVStore({ ...defaultOptions, ...options });
    kvstorePromises.set(name, kvstorePromise);
    return await kvstorePromise;
}

let featureFlags: Promise<FeatureFlags> | undefined;
export async function getFeatureFlagsClient(options?: KVStoreOptions): Promise<FeatureFlags> {
    if (featureFlags) {
        return await featureFlags;
    }

    featureFlags = (async () => {
        const store = await getKVStore({ ...defaultOptions, ...options });
        return new FeatureFlags(store);
    })();
    return await featureFlags;
}

let locking: Promise<Locking> | undefined;
export async function getLocking(options?: KVStoreOptions): Promise<Locking> {
    if (locking) {
        return await locking;
    }

    locking = (async () => {
        const store = await getKVStore({ ...defaultOptions, ...options });
        return new Locking(store);
    })();
    return await locking;
}
