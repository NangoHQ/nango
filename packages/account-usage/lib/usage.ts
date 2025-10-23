import tracer from 'dd-trace';

import { records } from '@nangohq/records';
import { connectionService, environmentService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { UsageCache } from './cache.js';
import { logger } from './logger.js';
import { usageMetrics } from './metrics.js';

import type { UsageMetric } from './metrics.js';
import type { getRedis } from '@nangohq/kvstore';
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

    constructor(redis: Awaited<ReturnType<typeof getRedis>>) {
        this.cache = new UsageCache(redis);
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
        const sources: Record<UsageMetric, string> = {
            connections: 'db:connections',
            records: 'db:records',
            // Orb related metrics are fetched from the same orb endpoint, hence the same source
            proxy: 'orb:subscription:usage',
            function_executions: 'orb:subscription:usage',
            function_compute_gbms: 'orb:subscription:usage',
            webhook_forwards: 'orb:subscription:usage',
            function_logs: 'orb:subscription:usage'
        };
        return tracer.trace('nango.usage.revalidate', { tags: { accountId, metric } }, async (span) => {
            // Acquire a lock to avoid multiple revalidations in parallel
            const lockKey = `${cacheKeyPrefix}:revalidate:${accountId}:${sources[metric]}`;
            const lock = await this.cache.tryAcquireLock(lockKey, { ttlMs: 60_000 });
            if (lock.isErr()) {
                return Ok(undefined);
            }
            try {
                let count: number | undefined = undefined;
                switch (metric) {
                    case 'connections': {
                        count = await connectionService.countByAccountId(accountId);
                        break;
                    }
                    case 'records': {
                        const envs = await environmentService.getEnvironmentsByAccountId(accountId);
                        if (envs.length > 0) {
                            const envIds = envs.map((e) => e.id);
                            const res = await records.metrics({ environmentIds: envIds });
                            if (res.isErr()) {
                                throw res.error;
                            }
                            count = res.value.reduce((acc, entry) => acc + entry.count, 0);
                        }
                        break;
                    }
                    case 'proxy':
                    case 'function_executions':
                    case 'function_compute_gbms':
                    case 'webhook_forwards':
                    case 'function_logs':
                        // TODO
                        break;
                }
                if (count !== undefined) {
                    const now = new Date();
                    const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
                    await this.cache.overwrite(cacheKey, count);
                    span?.setTag('count', count);
                }
                return Ok(undefined);
            } catch (err) {
                logger.error(`Failed to revalidate usage for accountId: ${accountId}, metric: ${metric}`, err);
                span?.setTag('error', err);
                return Err(new Error('usage_revalidate_error'));
            } finally {
                // not releasing the lock on purpose to avoid quick re-entrance in case of error
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
}
