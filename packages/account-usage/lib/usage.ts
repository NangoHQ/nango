import tracer from 'dd-trace';

import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { connectionService, environmentService, getPlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { UsageBillingClient } from './billing.js';
import { UsageCache } from './cache.js';
import { logger } from './logger.js';
import { usageMetrics } from './metrics.js';

import type { getRedis } from '@nangohq/kvstore';
import type { BillingUsageMetric, GetBillingUsageOpts, UsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

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
    getBillingUsage(subscriptionId: string, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetric[]>>;
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

    public async getBillingUsage(): Promise<Result<BillingUsageMetric[]>> {
        return Promise.resolve(Ok([]));
    }
}

export class UsageTracker implements IUsageTracker {
    private cache: UsageCache;
    public billingClient: UsageBillingClient;

    constructor(redis: Awaited<ReturnType<typeof getRedis>>) {
        this.cache = new UsageCache(redis);
        this.billingClient = new UsageBillingClient(redis);
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
        const span = tracer.startSpan('nango.usage.revalidate', {
            tags: { accountId, metric, source }
        });
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
                    const count = await this.getRecordsUsage(accountId);
                    if (count.isErr()) {
                        throw count.error;
                    }
                    const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
                    await this.cache.overwrite(cacheKey, count.value);
                    span?.setTag('count', count.value);
                    return Ok(undefined);
                }
                case 'proxy':
                case 'function_executions':
                case 'function_compute_gbms':
                case 'webhook_forwards':
                case 'function_logs': {
                    const billingUsage = await this.getBillingMetrics(accountId);
                    if (billingUsage.isErr()) {
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
                default: {
                    ((_exhaustiveCheck: never) => {
                        throw new Error(`Unhandled usage metric type: ${metric}`);
                    })(metric);
                }
            }
        } catch (err) {
            logger.error(`Failed to revalidate usage for accountId: ${accountId}, metric: ${metric}`, err);
            span?.setTag('error', err);
            return Err(new Error('usage_revalidate_error'));
        } finally {
            span?.finish();
            // Note: not releasing the lock to avoid quick re-entrance in case of error
        }
    }

    public async getBillingUsage(subscriptionId: string, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetric[]>> {
        const billingUsageMetrics = await this.billingClient.getUsage(subscriptionId, opts);

        if (billingUsageMetrics.isErr()) {
            return billingUsageMetrics;
        }

        return Ok(
            billingUsageMetrics.value.map((billingUsageMetric) => {
                const usageMetric = billingMetricToUsageMetric(billingUsageMetric.name);
                const shouldBeCumulative = usageMetric && ['connections', 'records'].includes(usageMetric);

                return shouldBeCumulative ? toCumulativeUsage(billingUsageMetric) : billingUsageMetric;
            })
        );
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

    private async getBillingMetrics(accountId: number): Promise<Result<Record<UsageMetric, number>>> {
        const plan = await getPlan(db.knex, { accountId });
        if (plan.isErr()) {
            return Err(plan.error);
        }
        if (!plan.value.orb_subscription_id) {
            return Err(new Error('orb_subscription_id_missing'));
        }
        const billingUsage: Result<BillingUsageMetric[]> = await this.getBillingUsage(plan.value.orb_subscription_id);
        if (billingUsage.isErr()) {
            // Note: errors (including rate limit errors) are not being retried
            // revalidateAfter isn't being updated, so next incr will attempt to revalidate again
            return Err(billingUsage.error);
        }
        const res = {} as Record<UsageMetric, number>;
        for (const billingMetric of billingUsage.value) {
            const usageMetric = billingMetricToUsageMetric(billingMetric.name);
            if (usageMetric) {
                res[usageMetric] = billingMetric.total;
            }
        }
        return Ok(res);
    }

    private async getRecordsUsage(accountId: number): Promise<Result<number>> {
        const envs = await environmentService.getEnvironmentsByAccountId(accountId);
        let count = 0;
        if (envs.length > 0) {
            const envIds = envs.map((e) => e.id);
            for await (const recordCounts of records.paginateRecordCounts({ environmentIds: envIds })) {
                if (recordCounts.isErr()) {
                    return Err(recordCounts.error);
                }
                if (recordCounts.value.length === 0) {
                    continue;
                }
                const connectionIds = recordCounts.value.map((r) => r.connection_id);
                for await (const connPage of connectionService.paginateConnections({ connectionIds })) {
                    if (connPage.isErr()) {
                        return Err(connPage.error);
                    }
                    for (const conn of connPage.value) {
                        // sum records data for this connection. There might be multiple models or variants for the same connection
                        const sum = recordCounts.value
                            .filter((r) => r.connection_id === conn.connection.id)
                            .reduce((acc, curr) => {
                                acc += curr.count;
                                return acc;
                            }, 0);
                        count += sum;
                    }
                }
            }
        }
        return Ok(count);
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
    if (lowerName.includes('function')) return 'function_executions';
    if (lowerName.includes('connections')) return 'connections';
    if (lowerName.includes('records')) return 'records';

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

function toCumulativeUsage(periodicUsage: BillingUsageMetric): BillingUsageMetric {
    const orderedPeriodicUsage = periodicUsage.usage.sort((a, b) => new Date(a.timeframeStart).getTime() - new Date(b.timeframeStart).getTime());
    const cumulativeUsage: BillingUsageMetric['usage'] = [];
    let previousQuantity = 0;

    for (const usage of orderedPeriodicUsage) {
        if (usage?.quantity === undefined) {
            cumulativeUsage.push(usage);
            continue;
        }
        const quantity = usage.quantity + previousQuantity;

        cumulativeUsage.push({
            timeframeStart: usage.timeframeStart,
            timeframeEnd: usage.timeframeEnd,
            quantity: quantity
        });

        previousQuantity = quantity;
    }
    return {
        ...periodicUsage,
        view_mode: 'cumulative',
        usage: cumulativeUsage
    };
}
