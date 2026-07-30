import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { getRedisUrl } from '@nangohq/kvstore';
import { getLogger } from '@nangohq/utils';

import { createRateLimiterRedisClient } from '../../../../utils/rateLimiterRedisClient.js';

import type { RateLimiterAbstract } from 'rate-limiter-flexible';

const logger = getLogger('Impersonation.challengeLimiter');

// The generic API rate limiter allows hundreds of requests per minute, which is enough to brute
// force a 6-digit code. Impersonation gets its own much tighter budget.
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

let limiterPromise: Promise<RateLimiterAbstract> | undefined;

async function getLimiter(): Promise<RateLimiterAbstract> {
    limiterPromise ??= (async () => {
        const opts = { keyPrefix: 'impersonate-mfa', points: MAX_ATTEMPTS, duration: WINDOW_SECONDS, blockDuration: WINDOW_SECONDS };

        const url = getRedisUrl();
        if (!url) {
            return new RateLimiterMemory(opts);
        }

        const redisClient = await createRateLimiterRedisClient(url);
        redisClient.on('error', (err) => {
            logger.error(`Redis (impersonation challenge limiter) error: ${err}`);
        });
        return new RateLimiterRedis({ storeClient: redisClient, useRedisPackage: true, ...opts });
    })();

    return limiterPromise;
}

/**
 * Consistent with the generic rate limiter, an unreachable store must not lock admins out of
 * support access, so every helper here fails open.
 */
export async function isChallengeLocked(userId: number): Promise<boolean> {
    try {
        const limiter = await getLimiter();
        const res = await limiter.get(String(userId));
        return res !== null && res.remainingPoints <= 0;
    } catch (err) {
        logger.error('Failed to read impersonation challenge attempts', { error: err });
        return false;
    }
}

export async function recordFailedChallenge(userId: number): Promise<void> {
    try {
        const limiter = await getLimiter();
        await limiter.consume(String(userId), 1);
    } catch (err) {
        if (err instanceof RateLimiterRes) {
            return;
        }
        logger.error('Failed to record impersonation challenge attempt', { error: err });
    }
}

export async function clearFailedChallenges(userId: number): Promise<void> {
    try {
        const limiter = await getLimiter();
        await limiter.delete(String(userId));
    } catch (err) {
        logger.error('Failed to clear impersonation challenge attempts', { error: err });
    }
}
