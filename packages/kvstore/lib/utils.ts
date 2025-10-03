import { Redis } from 'ioredis';
import { createClient } from 'redis';

import type { KVStoreClientLibrary, KVStoreOptions } from './KVStore.js';
import type { RedisClientType } from 'redis';

export function getDefaultKVStoreOptions(): KVStoreOptions {
    const options: KVStoreOptions = {
        name: 'default',
        clientLibrary: (process.env['NANGO_REDIS_CLIENT_LIBRARY'] as KVStoreClientLibrary) || 'node-redis',
        connect: true,
        pingInterval: 1_000,
        connectTimeout: 10_000,
        keepAlive: 60_000
    };

    if (process.env['NANGO_REDIS_URL']) options.url = process.env['NANGO_REDIS_URL'];
    if (process.env['NANGO_REDIS_HOST']) options.host = process.env['NANGO_REDIS_HOST'];
    if (process.env['NANGO_REDIS_PORT']) options.port = process.env['NANGO_REDIS_PORT'];
    if (process.env['NANGO_REDIS_AUTH']) options.auth = process.env['NANGO_REDIS_AUTH'];
    if (process.env['NANGO_REDIS_PING_INTERVAL']) options.pingInterval = parseInt(process.env['NANGO_REDIS_PING_INTERVAL']);
    if (process.env['NANGO_REDIS_CONNECT_TIMEOUT']) options.connectTimeout = parseInt(process.env['NANGO_REDIS_CONNECT_TIMEOUT']);
    if (process.env['NANGO_REDIS_KEEP_ALIVE']) options.keepAlive = parseInt(process.env['NANGO_REDIS_KEEP_ALIVE']);

    return options;
}

export function getNodeRedis(options: KVStoreOptions): RedisClientType {
    const url = options.url!;
    const isExternal = url.startsWith('rediss://');
    const socket = isExternal
        ? {
              reconnectStrategy: (retries: number) => Math.min(retries * 200, 2000),
              connectTimeout: options.connectTimeout || 10_000,
              tls: true,
              servername: new URL(url).hostname,
              keepAlive: options.keepAlive || 60_000
          }
        : {};

    const redis = createClient({
        url: url,
        disableOfflineQueue: true,
        pingInterval: options.pingInterval || 1_000,
        socket
    });
    redis.on('error', (err) => {
        // TODO: report error
        console.error(`Redis (kvstore) error: ${err}`);
    });
    return redis as RedisClientType;
}

export function getIORedis(options: KVStoreOptions): Redis {
    const url = options.url!;
    const isExternal = url.startsWith('rediss://');

    const redis = new Redis(url, {
        lazyConnect: true, // connect when you actually need it
        connectTimeout: options.connectTimeout || 5_000,
        keepAlive: options.keepAlive || 60_000,
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
