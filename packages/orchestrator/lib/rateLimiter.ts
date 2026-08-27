import { createSlidingWindowRateLimiter } from '@nangohq/kvstore';
import { metrics } from '@nangohq/utils';

import { logger } from './utils.js';

import type { SlidingWindowRateLimiter, SlidingWindowRateLimitResult } from '@nangohq/kvstore';

/** The limit always comes from the deploy-wide default until NAN-6542 adds per-environment overrides. */
const LIMIT_SOURCE = 'default';

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

/** Report every admission decision so a limit rollout can be watched per rate limit key. */
export function withThrottleTelemetry(limiter: SlidingWindowRateLimiter, limitPerMin: number): SlidingWindowRateLimiter {
    return {
        consume: async (key, units) => {
            const result = await limiter.consume(key, units);
            recordDecision(key, limitPerMin, result);
            return result;
        },
        destroy: () => limiter.destroy()
    };
}

// Window usage is the admitted count summed over the window, and the advised backoff is already
// reported by the dispatch consumer, so neither needs a metric of its own here.
function recordDecision(rateLimitKey: string, limitPerMin: number, result: SlidingWindowRateLimitResult): void {
    metrics.gauge(metrics.Types.ORCH_IMMEDIATE_THROTTLE_LIMIT, limitPerMin, { rateLimitKey, source: LIMIT_SOURCE });
    metrics.increment(metrics.Types.ORCH_IMMEDIATE_THROTTLE, result.admitted, { rateLimitKey, result: 'admitted' });
    metrics.increment(metrics.Types.ORCH_IMMEDIATE_THROTTLE, result.rejected, { rateLimitKey, result: 'throttled' });
}
