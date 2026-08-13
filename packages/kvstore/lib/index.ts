import { createClient } from 'redis';

import { InMemoryKVStore } from './InMemoryStore.js';
import { Locking } from './Locking.js';
import { getCustomerRedisUrl, getRedisClientOptions, getRedisUrl } from './redisClient.js';
import { RedisKVStore } from './RedisStore.js';
import { InMemorySlidingWindowRateLimiter, RedisSlidingWindowRateLimiter } from './SlidingWindowRateLimiter.js';

import type { KVStore } from './KVStore.js';
import type { NangoRedisClient, RedisBoundary } from './redisClient.js';
import type { SlidingWindowRateLimiter, SlidingWindowRateLimiterOptions } from './SlidingWindowRateLimiter.js';

export { InMemoryKVStore } from './InMemoryStore.js';
export { RedisKVStore } from './RedisStore.js';
export type { DeleteIfValueEqualsWithCompanionArgs, KVStore, SetIfValueEqualsWithCompanionArgs, SetNxWithCompanionArgs } from './KVStore.js';
export { type Lock, Locking } from './Locking.js';
export { type NangoRedisClient, type RedisBoundary, getCustomerRedisUrl, getRedisClientOptions, getRedisUrl } from './redisClient.js';
export {
    InMemorySlidingWindowRateLimiter,
    RedisSlidingWindowRateLimiter,
    type SlidingWindowRateLimiter,
    type SlidingWindowRateLimiterOptions,
    type SlidingWindowRateLimitResult
} from './SlidingWindowRateLimiter.js';

type KvBoundary = RedisBoundary;

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

export function createSlidingWindowRateLimiter(options: SlidingWindowRateLimiterOptions): Promise<SlidingWindowRateLimiter> {
    try {
        const url = getRedisUrl();
        if (!url) {
            return Promise.resolve(new InMemorySlidingWindowRateLimiter(options));
        }

        let client: NangoRedisClient | undefined;
        let connection: Promise<NangoRedisClient> | undefined;

        const getClient = async (): Promise<NangoRedisClient> => {
            if (client?.isReady) {
                return client;
            }
            if (connection) {
                return await connection;
            }

            const redisOptions = getRedisClientOptions(url);
            const redis = createClient({
                ...redisOptions,
                socket: {
                    ...redisOptions.socket,
                    reconnectStrategy: () => false,
                    connectTimeout: 1000
                }
            });
            redis.on('error', (err: Error) => {
                console.error(`Redis (sliding-window-rate-limiter) error: ${err}`);
            });

            connection = redis
                .connect()
                .then((connected) => {
                    client = connected;
                    return connected;
                })
                .finally(() => {
                    connection = undefined;
                });
            return await connection;
        };

        const destroyClient = async (): Promise<void> => {
            const connected = client ?? (await connection?.catch(() => undefined));
            if (connected?.isOpen) {
                await connected.disconnect();
            }
        };

        return Promise.resolve(new RedisSlidingWindowRateLimiter(getClient, options, destroyClient));
    } catch (err) {
        return Promise.reject(err);
    }
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
