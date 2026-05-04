import crypto from 'crypto';

import { RateLimiterQueue, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { stringify as stableStringify } from 'safe-stable-stringify';

import { billing } from '@nangohq/billing';
import { Ok, metrics } from '@nangohq/utils';

import { envs } from './env.js';

import type { getRedis } from '@nangohq/kvstore';
import type { BillingUsageMetrics, GetBillingUsageOpts } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class UsageBillingClient {
    private billingClient: typeof billing;
    private redis: Awaited<ReturnType<typeof getRedis>>;
    private throttler: RateLimiterQueue;

    constructor(redis: Awaited<ReturnType<typeof getRedis>>) {
        this.redis = redis;
        const limiter = new RateLimiterRedis({
            storeClient: redis,
            keyPrefix: 'billing',
            points: envs.USAGE_BILLING_API_MAX_RPS,
            duration: 1
        });
        this.throttler = new RateLimiterQueue(limiter, {
            maxQueueSize: envs.USAGE_BILLING_API_MAX_QUEUE_SIZE
        });

        this.billingClient = billing;
    }

    public async getUsage(subscriptionId: string, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>> {
        const cacheKey = this.getCacheKey(subscriptionId, opts);
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            try {
                const parsed: BillingUsageMetrics = JSON.parse(cached);
                metrics.increment(metrics.Types.BILLING_USAGE_CACHE, 1, { hit: 'true' });
                return Ok(parsed);
            } catch {
                // ignore parse errors and proceed to fetch from API
            }
        }
        metrics.increment(metrics.Types.BILLING_USAGE_CACHE, 1, { hit: 'false' });

        const tags = { dashboard: opts?.timeframe ? 'true' : 'false' };

        // Pure Orb call latency (no queue wait, no cache lookup) — apples-to-apples for any
        // Orb-vs-alternative-backend comparison.
        const callOrb = metrics.time(metrics.Types.BILLING_USAGE_ORB_MS, () => this.billingClient.getUsage(subscriptionId, opts), tags);

        return this.throttle('usage', async () => {
            const res = await callOrb();
            if (res.isOk()) {
                try {
                    await this.redis.set(cacheKey, JSON.stringify(res.value), {
                        EX: envs.USAGE_BILLING_API_CACHE_TTL_SECONDS
                    });
                } catch {
                    // ignore cache set errors
                }
            } else {
                metrics.increment(metrics.Types.BILLING_USAGE_ORB_ERRORS, 1, tags);
            }
            return res;
        });
    }

    private getCacheKey(subscriptionId: string, opts?: GetBillingUsageOpts): string {
        const base = `billing:usage:${subscriptionId}`;
        if (opts) {
            const stableString = stableStringify(opts);
            const hash = crypto.createHash('sha256').update(stableString).digest('hex');
            return `${base}:${hash}`;
        }
        return base;
    }

    private async throttle<T>(key: string, fn: () => Promise<T>): Promise<T> {
        try {
            await this.throttler.removeTokens(1, key);
            return await fn();
        } catch (err) {
            if (err instanceof RateLimiterRes) {
                throw new Error('rate_limit_exceeded', { cause: err });
            }
            throw err;
        }
    }
}
