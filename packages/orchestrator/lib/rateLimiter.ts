import { createSlidingWindowRateLimiter } from '@nangohq/kvstore';
import { metrics } from '@nangohq/utils';

import { logger } from './utils.js';

import type { SlidingWindowRateLimiter, SlidingWindowRateLimitResult } from '@nangohq/kvstore';

const uncappedRateLimiter: SlidingWindowRateLimiter = {
    consume: (_key, units) => Promise.resolve({ admitted: units, rejected: 0, remaining: null, estimatedUsage: null, retryAfterMs: 0 }),
    destroy: () => Promise.resolve()
};

/**
 * Build the limiter guarding immediate task admission.
 * A limit of 0 disables throttling: every request is admitted and no Redis connection is opened.
 */
export async function createImmediateRateLimiter(limitPerMin: number): Promise<SlidingWindowRateLimiter> {
    if (limitPerMin <= 0) {
        logger.info('Immediate task throttling is disabled (ORCHESTRATOR_THROTTLED_IMMEDIATE_PER_MIN=0)');
        return uncappedRateLimiter;
    }

    logger.info(`Immediate task throttling is enabled (${limitPerMin}/min per rate limit key)`);
    const limiter = await createSlidingWindowRateLimiter({
        keyPrefix: 'orchestrator-throttled-immediate',
        limit: limitPerMin,
        windowMs: 60_000
    });
    return withThrottleTelemetry(limiter, limitPerMin);
}

/** Report every admission decision so a limit rollout can be watched. */
export function withThrottleTelemetry(limiter: SlidingWindowRateLimiter, limitPerMin: number): SlidingWindowRateLimiter {
    return {
        consume: async (key, units) => {
            const result = await limiter.consume(key, units);
            recordDecision(limitPerMin, result);
            return result;
        },
        destroy: () => limiter.destroy()
    };
}

// Untagged by rate limit key on purpose: that key is an environment id, which would put one tag
// value per environment on a metric emitted on every dispatch.
function recordDecision(limitPerMin: number, result: SlidingWindowRateLimitResult): void {
    metrics.gauge(metrics.Types.ORCH_IMMEDIATE_THROTTLE_LIMIT, limitPerMin);
    metrics.increment(metrics.Types.ORCH_IMMEDIATE_THROTTLE, result.admitted, { result: 'admitted' });
    metrics.increment(metrics.Types.ORCH_IMMEDIATE_THROTTLE, result.rejected, { result: 'throttled' });
}
