import crypto from 'crypto';

import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { stringify as stableStringify } from 'safe-stable-stringify';

import { billing } from '@nangohq/billing';
import { Ok } from '@nangohq/utils';

import { envs } from './env.js';

import type { getRedis } from '@nangohq/kvstore';
import type { BillingUsageMetric, GetBillingUsageOpts } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class UsageBillingClient {
    private billingClient: typeof billing;
    private redis: Awaited<ReturnType<typeof getRedis>>;
    private throttler: RateLimiterRedis;

    constructor(redis: Awaited<ReturnType<typeof getRedis>>) {
        this.redis = redis;
        this.throttler = new RateLimiterRedis({
            storeClient: redis,
            keyPrefix: 'billing',
            points: envs.USAGE_BILLING_API_MAX_RPS,
            duration: 1
        });
        this.billingClient = billing;
    }

    private async throttle<T>(key: string, fn: () => Promise<T>): Promise<T> {
        try {
            await this.throttler.consume(key);
            return await fn();
        } catch (err) {
            if (err instanceof RateLimiterRes) {
                throw new Error('rate_limit_exceeded');
            }
            throw err;
        }
    }

    public async getUsage(subscriptionId: string, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetric[]>> {
        const cacheKey = this.getCacheKey(subscriptionId, opts);
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            try {
                const parsed: BillingUsageMetric[] = JSON.parse(cached);
                return Ok(parsed);
            } catch {
                // ignore parse errors and proceed to fetch from API
            }
        }

        // global throttling to avoid exceeding Orb usage endpoint rate limits
        return this.throttle('usage', async () => {
            const res = await this.billingClient.getUsage(subscriptionId, opts);
            if (res.isOk()) {
                try {
                    await this.redis.set(cacheKey, JSON.stringify(res.value), {
                        EX: envs.USAGE_BILLING_API_CACHE_TTL_SECONDS
                    });
                } catch {
                    // ignore cache set errors
                }
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
}
