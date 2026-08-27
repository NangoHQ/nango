import { createSlidingWindowRateLimiter } from '@nangohq/kvstore';

import { logger } from './utils.js';

import type { SlidingWindowRateLimiter } from '@nangohq/kvstore';

/**
 * Build the limiter guarding immediate task admission.
 * A limit of 0 leaves keys unlimited by default. Per-group overrides still apply, and no Redis
 * connection is opened until a key that has one consumes.
 */
export function createImmediateRateLimiter(limitPerMin: number): Promise<SlidingWindowRateLimiter> {
    if (limitPerMin > 0) {
        logger.info(`Immediate task throttling is enabled (${limitPerMin}/min per rate limit key)`);
    } else {
        logger.info('Immediate task throttling has no global limit (ORCHESTRATOR_THROTTLED_IMMEDIATE_PER_MIN=0), only per-group overrides apply');
    }

    return createSlidingWindowRateLimiter({
        keyPrefix: 'orchestrator-throttled-immediate',
        limit: limitPerMin > 0 ? limitPerMin : null,
        windowMs: 60_000
    });
}
