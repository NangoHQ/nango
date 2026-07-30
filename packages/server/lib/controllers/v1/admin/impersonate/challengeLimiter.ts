import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { getRedisUrl } from '@nangohq/kvstore';
import { getLogger } from '@nangohq/utils';

import { createRateLimiterRedisClient } from '../../../../utils/rateLimiterRedisClient.js';

import type { RateLimiterAbstract } from 'rate-limiter-flexible';

const logger = getLogger('Impersonation.challengeLimiter');

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 5 * 60;

const opts = { keyPrefix: 'impersonate-mfa', points: MAX_ATTEMPTS, duration: WINDOW_SECONDS, blockDuration: WINDOW_SECONDS };

// Used when Redis is not configured
const memoryLimiter = new RateLimiterMemory(opts);

let sharedLimiterPromise: Promise<RateLimiterAbstract> | undefined;

async function buildSharedLimiter(url: string): Promise<RateLimiterAbstract> {
    const redisClient = await createRateLimiterRedisClient(url);
    redisClient.on('error', (err) => {
        logger.error(`Redis (impersonation challenge limiter) error: ${err}`);
    });
    return new RateLimiterRedis({ storeClient: redisClient, useRedisPackage: true, ...opts });
}

async function getSharedLimiter(): Promise<RateLimiterAbstract | undefined> {
    const url = getRedisUrl();
    if (!url) {
        return undefined;
    }

    sharedLimiterPromise ??= buildSharedLimiter(url).catch((err: unknown) => {
        // Drop the rejected promise so a later request rebuilds it. Caching it would leave this
        // process without a shared limiter for the rest of its lifetime after one transient failure.
        sharedLimiterPromise = undefined;
        throw err;
    });

    try {
        return await sharedLimiterPromise;
    } catch (err) {
        logger.error('Failed to build the impersonation challenge limiter', { error: err });
        return undefined;
    }
}

async function consume(limiter: RateLimiterAbstract, key: string): Promise<'ok' | 'exhausted' | 'error'> {
    try {
        await limiter.consume(key, 1);
        return 'ok';
    } catch (err) {
        if (err instanceof RateLimiterRes) {
            return 'exhausted';
        }
        logger.error('Impersonation challenge limiter failed to consume', { error: err });
        return 'error';
    }
}

/**
 * Spends one attempt from the admin's budget. Must be called *before* the code is verified: reading
 * the counter and consuming it separately would let concurrent wrong-code requests all pass the
 * check before any of them recorded a failure, multiplying the cap by the request concurrency.
 *
 * Returns false when the budget is spent. An unreachable Redis degrades to the process-local budget
 * rather than to no budget at all.
 */
export async function reserveChallengeAttempt(userId: number): Promise<boolean> {
    const key = String(userId);

    const shared = await getSharedLimiter();
    if (shared) {
        const result = await consume(shared, key);
        if (result !== 'error') {
            return result === 'ok';
        }
    }

    return (await consume(memoryLimiter, key)) === 'ok';
}

/**
 * Refunds the budget after a correct code, so earlier typos never hold back an admin who then
 * authenticates successfully.
 */
export async function clearChallengeAttempts(userId: number): Promise<void> {
    const key = String(userId);

    try {
        await memoryLimiter.delete(key);
        const shared = await getSharedLimiter();
        await shared?.delete(key);
    } catch (err) {
        logger.error('Failed to clear impersonation challenge attempts', { error: err });
    }
}
