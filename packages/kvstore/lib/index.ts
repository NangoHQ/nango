import { createClient } from 'redis';

import { FeatureFlags } from './FeatureFlags.js';
import { InMemoryKVStore } from './InMemoryStore.js';
import { Locking } from './Locking.js';
import { RedisKVStore } from './RedisStore.js';

import type { KVStore } from './KVStore.js';
import type { RedisClientType } from 'redis';

export { InMemoryKVStore } from './InMemoryStore.js';
export { FeatureFlags } from './FeatureFlags.js';
export { RedisKVStore } from './RedisStore.js';
export type { KVStore } from './KVStore.js';
export { type Lock, Locking } from './Locking.js';

type KvBoundary = 'system' | 'customer';

// Those getters can be accessed at any point so we store the promise to avoid race condition
// Not my best code
const mapRedis = new Map<string, RedisClientType>();
export async function getRedis(url: string): Promise<RedisClientType> {
    if (mapRedis.has(url)) {
        return mapRedis.get(url)!;
    }
    const isExternal = url.startsWith('rediss://');
    const socket = isExternal
        ? {
              reconnectStrategy: (retries: number) => Math.min(retries * 200, 2000),
              connectTimeout: 10_000,
              tls: true,
              servername: new URL(url).hostname,
              keepAlive: 60_000
          }
        : {};

    const redis = createClient({
        url: url,
        disableOfflineQueue: true,
        pingInterval: 30_000,
        socket
    });
    redis.on('error', (err: Error) => {
        // TODO: report error
        console.error(`Redis (kvstore) error: ${err}`);
    });

    await redis.connect();
    mapRedis.set(url, redis as RedisClientType);
    return redis as RedisClientType;
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

const mapRedisUrl = new Map<KvBoundary, string | undefined>();
mapRedisUrl.set('system', getRedisUrl());
mapRedisUrl.set('customer', getCustomerRedisUrl() || getRedisUrl());

function getRedisUrl(): string | undefined {
    const url = process.env['NANGO_REDIS_URL'];
    if (url) {
        return url;
    }
    const endpoint = process.env['NANGO_REDIS_HOST'];
    const port = process.env['NANGO_REDIS_PORT'] || 6379;
    const auth = process.env['NANGO_REDIS_AUTH'];
    if (endpoint && port && auth) {
        return `rediss://:${auth}@${endpoint}:${port}`;
    }
    return undefined;
}

function getCustomerRedisUrl(): string | undefined {
    const url = process.env['NANGO_CUSTOMER_REDIS_URL'];
    if (url) {
        return url;
    }
    const endpoint = process.env['NANGO_CUSTOMER_REDIS_HOST'];
    const port = process.env['NANGO_CUSTOMER_REDIS_PORT'] || 6379;
    const auth = process.env['NANGO_CUSTOMER_REDIS_AUTH'];
    if (endpoint && port && auth) {
        return `rediss://:${auth}@${endpoint}:${port}`;
    }
    return undefined;
}

async function createKVStore(usage: KvBoundary = 'system'): Promise<KVStore> {
    const url = mapRedisUrl.get(usage);
    if (url) {
        const store = new RedisKVStore(await getRedis(url));
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
