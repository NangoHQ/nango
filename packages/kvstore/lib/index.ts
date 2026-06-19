import { createClient } from 'redis';

import { InMemoryKVStore } from './InMemoryStore.js';
import { Locking } from './Locking.js';
import { RedisKVStore } from './RedisStore.js';
import { getCustomerRedisUrl, getRedisClientOptions, getRedisUrl } from './redisClient.js';

import type { KVStore } from './KVStore.js';
import type { NangoRedisClient, RedisBoundary } from './redisClient.js';

export { InMemoryKVStore } from './InMemoryStore.js';
export { RedisKVStore } from './RedisStore.js';
export type { DeleteIfValueEqualsWithCompanionArgs, KVStore, SetIfValueEqualsWithCompanionArgs, SetNxWithCompanionArgs } from './KVStore.js';
export { type Lock, Locking } from './Locking.js';
export { type NangoRedisClient, type RedisBoundary, getCustomerRedisUrl, getRedisClientOptions, getRedisUrl } from './redisClient.js';

type KvBoundary = RedisBoundary;

// Those getters can be accessed at any point so we store the promise to avoid race condition
// Not my best code
const mapRedis = new Map<string, NangoRedisClient>();

function redisClientCacheKey(url: string, boundary: RedisBoundary): string {
    return `${boundary}:${url}`;
}

export async function getRedis(url: string, boundary: RedisBoundary = 'system'): Promise<NangoRedisClient> {
    const cacheKey = redisClientCacheKey(url, boundary);
    if (mapRedis.has(cacheKey)) {
        return mapRedis.get(cacheKey)!;
    }
    const redis = createClient(getRedisClientOptions(url, boundary));
    redis.on('error', (err: Error) => {
        // TODO: report error
        console.error(`Redis (kvstore) error: ${err}`);
    });

    await redis.connect();
    mapRedis.set(cacheKey, redis);
    return redis;
}

export async function destroy() {
    await Promise.all(
        Array.from(mapKVStore.values()).map(async (kvstore) => {
            await (await kvstore).destroy();
        })
    );
    await Promise.all(
        Array.from(mapRedis.values()).map(async (redis) => {
            await redis.disconnect();
        })
    );
}

// Resolve the URL and its boundary once. When the customer boundary is not
// configured it falls back to the system URL (and system credentials).
const mapRedisConfig = new Map<KvBoundary, { url: string | undefined; boundary: RedisBoundary }>();
mapRedisConfig.set('system', { url: getRedisUrl(), boundary: 'system' });
const customerRedisUrl = getCustomerRedisUrl();
mapRedisConfig.set('customer', customerRedisUrl ? { url: customerRedisUrl, boundary: 'customer' } : { url: getRedisUrl(), boundary: 'system' });

async function createKVStore(usage: KvBoundary = 'system'): Promise<KVStore> {
    const config = mapRedisConfig.get(usage);
    if (config?.url) {
        const store = new RedisKVStore(await getRedis(config.url, config.boundary));
        return store;
    }
    return new InMemoryKVStore();
}

const mapKVStore = new Map<KvBoundary, Promise<KVStore>>();
export async function getKVStore(usage: KvBoundary = 'system'): Promise<KVStore> {
    if (mapKVStore.has(usage)) {
        return await mapKVStore.get(usage)!;
    }
    const createKVStorePromise = createKVStore(usage);
    mapKVStore.set(usage, createKVStorePromise);
    return await createKVStorePromise;
}

const mapLocking = new Map<KvBoundary, Promise<Locking>>();
export async function getLocking(usage: KvBoundary = 'system'): Promise<Locking> {
    if (mapLocking.has(usage)) {
        return await mapLocking.get(usage)!;
    }

    const locking = (async () => {
        const store = await getKVStore(usage);
        return new Locking(store);
    })();
    mapLocking.set(usage, locking);
    return await locking;
}
