import tracer from 'dd-trace';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { connectionService, environmentService, getPlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { UsageCache } from './cache.js';
import { envs } from './env.js';
import { logger } from './logger.js';
import { usageMetrics } from './metrics.js';

import type { UsageMetric } from './metrics.js';
import type { getRedis } from '@nangohq/kvstore';
import type { BillingUsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { IRateLimiterRedisOptions } from 'rate-limiter-flexible';

const cacheKeyPrefix = 'usageV2';

export interface UsageStatus {
    accountId: number;
    metric: UsageMetric;
    current: number;
}

export interface IUsageTracker {
    get(params: { accountId: number; metric: UsageMetric }): Promise<Result<UsageStatus>>;
    getAll(accountId: number): Promise<Result<Record<UsageMetric, UsageStatus>>>;
    incr(params: { accountId: number; metric: UsageMetric; delta?: number; forceRevalidation?: boolean }): Promise<Result<UsageStatus>>;
    revalidate({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<Result<void>>;
}

export class UsageTrackerNoOps implements IUsageTracker {
    public async get({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<Result<UsageStatus>> {
        return Promise.resolve(
            Ok({
                accountId,
                metric,
                current: 0
            })
        );
    }

    public async getAll(accountId: number): Promise<Result<Record<UsageMetric, UsageStatus>>> {
        const result: Record<UsageMetric, UsageStatus> = {} as Record<UsageMetric, UsageStatus>;
        for (const metric of Object.keys(usageMetrics) as UsageMetric[]) {
            result[metric] = {
                accountId,
                metric,
                current: 0
            };
        }
        return Promise.resolve(Ok(result));
    }

    public async incr({ accountId, metric, delta = 1 }: { accountId: number; metric: UsageMetric; delta?: number }): Promise<Result<UsageStatus>> {
        return Promise.resolve(
            Ok({
                accountId,
                metric,
                current: delta
            })
        );
    }

    public async revalidate(): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }
}

export class UsageTracker implements IUsageTracker {
    private cache: UsageCache;
    private throttler: Throttler;
    private billingClient: typeof billing;

    constructor(redis: Awaited<ReturnType<typeof getRedis>>) {
        this.cache = new UsageCache(redis);
        this.throttler = new Throttler({
            storeClient: redis,
            keyPrefix: 'billing',
            points: envs.USAGE_BILLING_API_MAX_RPS,
            duration: 1
        });
        this.billingClient = billing;
    }

    public async get({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<Result<UsageStatus>> {
        const now = new Date();
        const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
        const entry = await this.cache.get(cacheKey);
        if (entry.isErr()) {
            return Err(entry.error);
        }
        return Ok({
            accountId,
            metric,
            current: entry.value?.count || 0
        });
    }

    public async getAll(accountId: number): Promise<Result<Record<UsageMetric, UsageStatus>>> {
        const now = new Date();
        const result: Record<UsageMetric, UsageStatus> = {} as Record<UsageMetric, UsageStatus>;
        await Promise.all(
            Object.keys(usageMetrics).map(async (metric) => {
                const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric: metric as UsageMetric, now });
                const entry = await this.cache.get(cacheKey);
                if (entry.isErr()) {
                    return;
                }
                result[metric as UsageMetric] = {
                    accountId,
                    metric: metric as UsageMetric,
                    current: entry.value?.count || 0
                };
            })
        );
        return Ok(result);
    }

    public async incr({
        accountId,
        metric,
        delta = 1,
        forceRevalidation = false
    }: {
        accountId: number;
        metric: UsageMetric;
        delta?: number;
        forceRevalidation?: boolean;
    }): Promise<Result<UsageStatus>> {
        const now = new Date();
        const { cacheKey, ttlMs } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
        const entry = await this.cache.incr(cacheKey, { delta, ttlMs });
        if (entry.isErr()) {
            return Err(entry.error);
        }

        // revalidate if:
        // - forced
        // - or the entry is stale
        if (forceRevalidation || (entry.value.revalidateAfter && entry.value.revalidateAfter < now.getTime())) {
            void this.revalidate({ accountId, metric });
        }

        return Ok({
            accountId,
            metric,
            current: entry.value.count
        });
    }

    public async revalidate({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<Result<void>> {
        const source = sources[metric];
        return tracer.trace('nango.usage.revalidate', { tags: { accountId, metric, source } }, async (span) => {
            // Acquire a lock to avoid multiple revalidations in parallel
            const lockKey = `${cacheKeyPrefix}:revalidate:${accountId}:${source}`;
            const lock = await this.cache.tryAcquireLock(lockKey, { ttlMs: 60_000 });
            if (lock.isErr()) {
                // another revalidation is in progress, skip
                return Ok(undefined);
            }
            try {
                const now = new Date();
                switch (metric) {
                    case 'connections': {
                        const count = await connectionService.countByAccountId(accountId);
                        const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
                        await this.cache.overwrite(cacheKey, count);
                        return Ok(undefined);
                    }
                    case 'records': {
                        const envs = await environmentService.getEnvironmentsByAccountId(accountId);
                        if (envs.length > 0) {
                            const envIds = envs.map((e) => e.id);
                            const res = await records.metrics({ environmentIds: envIds });
                            if (res.isErr()) {
                                throw res.error;
                            }
                            const count = res.value.reduce((acc, entry) => acc + entry.count, 0);
                            const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
                            await this.cache.overwrite(cacheKey, count);
                            span?.setTag('count', count);
                        }
                        return Ok(undefined);
                    }
                    case 'proxy':
                    case 'function_executions':
                    case 'function_compute_gbms':
                    case 'webhook_forwards':
                    case 'function_logs': {
                        const billingUsage = await this.getBillingUsage(accountId);
                        if (billingUsage.isErr()) {
                            logger.warning(`Failed to fetch billing usage for accountId: ${accountId}`, billingUsage.error);
                            if (billingUsage.error.message === 'rate_limit_exceeded') {
                                span?.setTag('rate_limited', true);
                            }
                            throw billingUsage.error;
                        }
                        // update all billing-related metrics
                        for (const [metric, count] of Object.entries(billingUsage.value)) {
                            const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric: metric as UsageMetric, now });
                            await this.cache.overwrite(cacheKey, count);
                        }
                        return Ok(undefined);
                    }
                }
            } catch (err) {
                logger.error(`Failed to revalidate usage for accountId: ${accountId}, metric: ${metric}`, err);
                span?.setTag('error', err);
                return Err(new Error('usage_revalidate_error'));
            } finally {
                // not releasing the lock to avoid quick re-entrance in case of error
            }
        });
    }

    private static getCacheEntryProps({ accountId, metric, now }: { accountId: number; metric: UsageMetric; now: Date }): { cacheKey: string; ttlMs?: number } {
        const cacheKey = `${cacheKeyPrefix}:${accountId}:${metric}`;
        if (usageMetrics[metric].reset === 'monthly') {
            // monthly metrics have a YYYY-MM suffix
            const yyyymm = now.toISOString().slice(0, 7);
            const untilNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1); // first day of next month
            return {
                cacheKey: `${cacheKey}:${yyyymm}`,
                ttlMs: untilNextMonth.getTime() - now.getTime() + 60 * 1000 // add 1 minute buffer
            };
        }
        return { cacheKey };
    }

    private async getBillingUsage(accountId: number): Promise<Result<Record<UsageMetric, number>>> {
        const billingUsage: Result<BillingUsageMetric[]> = await this.throttler.execute('usage', async () => {
            const plan = await getPlan(db.knex, { accountId });
            if (plan.isErr()) {
                return Err(plan.error);
            }
            if (!plan.value.orb_subscription_id) {
                return Err(new Error('orb_subscription_id_missing'));
            }
            const subscriptionId = plan.value.orb_subscription_id;
            return this.billingClient.getUsage(subscriptionId);
        });
        if (billingUsage.isErr()) {
            return Err(billingUsage.error);
        }
        const res = {} as Record<UsageMetric, number>;
        for (const billingMetric of billingUsage.value) {
            const usageMetric = billingMetricToUsageMetric(billingMetric.name);
            if (usageMetric) {
                res[usageMetric] = billingMetric.quantity;
            }
        }
        return Ok(res);
    }
}

class Throttler {
    private throttler: RateLimiterRedis;

    constructor(opts: IRateLimiterRedisOptions) {
        this.throttler = new RateLimiterRedis(opts);
    }

    public async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
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
}

function billingMetricToUsageMetric(name: string): UsageMetric | null {
    // Not ideal to match on BillingMetric name but Orb only exposes the user friendly name or internal ids
    const lowerName = name.toLowerCase();
    // order matters here
    if (lowerName.includes('legacy')) return null;
    if (lowerName.includes('logs')) return 'function_logs';
    if (lowerName.includes('proxy')) return 'proxy';
    if (lowerName.includes('forward')) return 'webhook_forwards';
    if (lowerName.includes('compute')) return 'function_compute_gbms';
    if (lowerName.includes('records')) return 'records';
    if (lowerName.includes('connections')) return 'connections';
    if (lowerName.includes('function')) return 'function_executions';

    return null;
}

const sources: Record<UsageMetric, string> = {
    // source of truth for connections and records is main internal db
    connections: 'db:connections',
    records: 'db:records',
    // billing related metrics are fetched from the same billing endpoint, hence the same source
    proxy: 'billing:subscription:usage',
    function_executions: 'billing:subscription:usage',
    function_compute_gbms: 'billing:subscription:usage',
    webhook_forwards: 'billing:subscription:usage',
    function_logs: 'billing:subscription:usage'
};
