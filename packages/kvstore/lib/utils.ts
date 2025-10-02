import { Redis } from 'ioredis';
import { createClient } from 'redis';

import type { RedisClientType } from 'redis';

export function getNodeRedis(url: string): RedisClientType {
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
    redis.on('error', (err) => {
        // TODO: report error
        console.error(`Redis (kvstore) error: ${err}`);
    });
    return redis;
}

export function getIORedis(url: string): Redis {
    const isExternal = url.startsWith('rediss://');

    const redis = new Redis(url, {
        lazyConnect: true, // connect when you actually need it
        connectTimeout: 5_000,
        maxRetriesPerRequest: 3, // bound per-command retries
        enableReadyCheck: true,
        enableAutoPipelining: true, // batches multiple commands per tick
        retryStrategy(times) {
            // reconnect for dropped sockets
            const base = Math.min(times, 10);
            const ms = Math.min(30_000, 200 * 2 ** base);
            // decorrelated jitter
            return Math.floor(ms / 2 + Math.random() * ms);
        },
        ...(isExternal && { tls: {} })
    });
    return redis;
}
