import type { UsageMetric } from '../metrics.js';
import type { UsageStore } from './usageStore.js';

/**
 * A UsageStore that uses a quick store for quick reads and writes,
 * and a persistent store as fallback for reads.
 * The cached store is dumped to the persistent store separately in a cron job.
 */
export class HybridUsageStore implements UsageStore {
    constructor(
        private readonly cacheStore: UsageStore,
        private readonly persistentStore: UsageStore
    ) {}

    async getUsage(accountId: number, metric: UsageMetric, month?: Date): Promise<number> {
        const cachedUsage = await this.cacheStore.getUsage(accountId, metric, month);
        if (cachedUsage) {
            return cachedUsage;
        }

        const persistedUsage = await this.persistentStore.getUsage(accountId, metric, month);
        if (persistedUsage) {
            await this.cacheStore.setUsage(accountId, metric, persistedUsage);
            return persistedUsage;
        }

        return this.cacheStore.setUsage(accountId, metric, 0);
    }

    async setUsage(accountId: number, metric: UsageMetric, value: number, month?: Date): Promise<number> {
        return this.cacheStore.setUsage(accountId, metric, value, month);
    }

    async incrementUsage(accountId: number, metric: UsageMetric, delta: number, month?: Date): Promise<number> {
        return this.cacheStore.incrementUsage(accountId, metric, delta, month);
    }
}
