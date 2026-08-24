import { createSlidingWindowRateLimiter } from '@nangohq/kvstore';

import { logger } from './utils.js';

import type { SlidingWindowRateLimiter } from '@nangohq/kvstore';

const uncappedRateLimiter: SlidingWindowRateLimiter = {
    consume: (_key, units) => Promise.resolve({ admitted: units, rejected: 0, remaining: null, estimatedUsage: null, retryAfterMs: 0 }),
    destroy: () => Promise.resolve()
};

/**
 * Build the limiter guarding immediate task admission.
 * A limit of 0 disables throttling: every request is admitted and no Redis connection is opened.
 */
export function createImmediateRateLimiter(limitPerMin: number): Promise<SlidingWindowRateLimiter> {
    if (limitPerMin <= 0) {
        logger.info('Immediate task throttling is disabled (ORCHESTRATOR_THROTTLED_IMMEDIATE_PER_MIN=0)');
        return Promise.resolve(uncappedRateLimiter);
    }

    logger.info(`Immediate task throttling is enabled (${limitPerMin}/min per rate limit key)`);
    return createSlidingWindowRateLimiter({
        keyPrefix: 'orchestrator-throttled-immediate',
        limit: limitPerMin,
        windowMs: 60_000
    });
}
