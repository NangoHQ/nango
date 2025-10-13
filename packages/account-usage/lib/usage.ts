import { Err, Ok } from '@nangohq/utils';

import { UsageCache } from './cache.js';
import { logger } from './logger.js';
import { usageMetrics } from './metrics.js';

import type { UsageMetric } from './metrics.js';
import type { KVStore } from '@nangohq/kvstore';
import type { Result } from '@nangohq/utils';

export interface UsageStatus {
    accountId: number;
    metric: UsageMetric;
    current: number;
}

interface IUsage {
    incr(params: { accountId: number; metric: UsageMetric; delta?: number }): Promise<Result<UsageStatus>>;
}

export class UsageNoOps implements IUsage {
    public async incr({ accountId, metric, delta = 1 }: { accountId: number; metric: UsageMetric; delta?: number }): Promise<Result<UsageStatus>> {
        return Promise.resolve(
            Ok({
                accountId,
                metric,
                current: delta
            })
        );
    }
}

export class Usage implements IUsage {
    private cache: UsageCache;

    constructor(store: KVStore) {
        this.cache = new UsageCache(store);
    }

    public async incr({ accountId, metric, delta = 1 }: { accountId: number; metric: UsageMetric; delta?: number }): Promise<Result<UsageStatus>> {
        const now = new Date();
        const { cacheKey, ttlMs } = Usage.getCacheEntryProps({ accountId, metric, now });
        const entry = await this.cache.incr(cacheKey, { delta, ttlMs });
        if (entry.isErr()) {
            return Err(entry.error);
        }

        // revalidate if the entry is stale or expired
        if (entry.value.revalidateAfter && entry.value.revalidateAfter < now.getTime()) {
            void Usage.revalidate({ accountId, metric });
        }

        return Ok({
            accountId,
            metric,
            current: entry.value.count
        });
    }

    private static getCacheEntryProps({ accountId, metric, now }: { accountId: number; metric: UsageMetric; now: Date }): { cacheKey: string; ttlMs?: number } {
        const cacheKey = `usage:${accountId}:${metric}`;
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

    private static async revalidate({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<void> {
        logger.debug(`Revalidating usage for accountId=${accountId} metric=${metric}. Not implemented yet`);
        return Promise.resolve();
    }
}
