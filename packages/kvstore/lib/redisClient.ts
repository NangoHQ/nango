import { readFileSync } from 'node:fs';

import { envs } from './env.js';

export type RedisBoundary = 'system' | 'customer';

const reconnectStrategy = (retries: number): number => Math.min(retries * 200, 2000);

/**
 * Resolve the system-boundary Redis URL.
 *
 * When a token file is configured the URL carries no inline credentials — they
 * are supplied by the credentials provider in {@link getRedisClientOptions}.
 */
export function getRedisUrl(): string | undefined {
    if (envs.NANGO_REDIS_URL) {
        return envs.NANGO_REDIS_URL;
    }
    const endpoint = envs.NANGO_REDIS_HOST;
    const port = envs.NANGO_REDIS_PORT || 6379;
    if (!endpoint) {
        return undefined;
    }
    if (envs.NANGO_REDIS_AUTH_TOKEN_FILE) {
        return `rediss://${endpoint}:${port}`;
    }
    const auth = envs.NANGO_REDIS_AUTH;
    if (auth) {
        return `rediss://:${auth}@${endpoint}:${port}`;
    }
    return undefined;
}

/** Resolve the customer-boundary Redis URL. See {@link getRedisUrl}. */
export function getCustomerRedisUrl(): string | undefined {
    if (envs.NANGO_CUSTOMER_REDIS_URL) {
        return envs.NANGO_CUSTOMER_REDIS_URL;
    }
    const endpoint = envs.NANGO_CUSTOMER_REDIS_HOST;
    const port = envs.NANGO_CUSTOMER_REDIS_PORT || 6379;
    if (!endpoint) {
        return undefined;
    }
    if (envs.NANGO_CUSTOMER_REDIS_AUTH_TOKEN_FILE) {
        return `rediss://${endpoint}:${port}`;
    }
    const auth = envs.NANGO_CUSTOMER_REDIS_AUTH;
    if (auth) {
        return `rediss://:${auth}@${endpoint}:${port}`;
    }
    return undefined;
}

function getBoundaryTokenAuth(boundary: RedisBoundary): { username: string | undefined; tokenFile: string | undefined } {
    if (boundary === 'customer') {
        return { username: envs.NANGO_CUSTOMER_REDIS_USERNAME, tokenFile: envs.NANGO_CUSTOMER_REDIS_AUTH_TOKEN_FILE };
    }
    return { username: envs.NANGO_REDIS_USERNAME, tokenFile: envs.NANGO_REDIS_AUTH_TOKEN_FILE };
}

/**
 * Build node-redis client options for a URL, centralizing TLS/socket settings
 * and (optionally) rotating-token authentication.
 *
 * When the boundary has `NANGO_(CUSTOMER_)REDIS_AUTH_TOKEN_FILE` set, an async
 * credentials provider is attached. node-redis invokes it on every (re)connect
 * handshake, so a token rotated on disk (e.g. GCP/AWS/Azure IAM auth) is always
 * read fresh — no inline credentials in the URL and no manual re-AUTH needed.
 * When unset, behaviour is identical to the previous static-auth setup.
 */
export function getRedisClientOptions(url: string, boundary: RedisBoundary = 'system') {
    const isExternal = url.startsWith('rediss://');
    const socket = isExternal
        ? {
              reconnectStrategy,
              connectTimeout: 10_000,
              tls: true as const,
              servername: new URL(url).hostname,
              // node-redis v5 enables keepAlive by default (initial delay 5s); keep the
              // previous 60s initial delay so behaviour matches the pre-v5 setup.
              keepAlive: true,
              keepAliveInitialDelay: 60_000
          }
        : {};

    const { username, tokenFile } = getBoundaryTokenAuth(boundary);
    const credentialsProvider = tokenFile
        ? {
              type: 'async-credentials-provider' as const,
              credentials: () => {
                  const password = readFileSync(tokenFile, 'utf8').trim();
                  return Promise.resolve(username !== undefined ? { username, password } : { password });
              }
          }
        : undefined;

    return {
        url,
        // node-redis v5 defaults to RESP2, which mishandles pub/sub status replies
        // (subscribe/unsubscribe acks) and can throw when the command queue is empty.
        // RESP3 routes pub/sub through a dedicated push handler and also allows
        // re-authentication while a subscriber connection is active.
        RESP: 3 as const,
        disableOfflineQueue: true,
        pingInterval: 30_000,
        socket,
        ...(credentialsProvider ? { credentialsProvider } : {})
    };
}
