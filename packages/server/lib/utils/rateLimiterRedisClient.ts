import { createClient } from 'redis';

export async function createRateLimiterRedisClient(url: string): Promise<ReturnType<typeof createClient>> {
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

    return createClient({
        url,
        disableOfflineQueue: true,
        pingInterval: 30_000,
        socket
    }).connect();
}
