import type { AccountUsageStore, GetUsageParams, IncrementUsageParams, SetUsageParams } from './accountUsageStore.js';

/**
 * A UsageStore that uses a "quick" store for quick reads and writes,
 * and a persistent store as fallback for reads.
 * The cached store is dumped to the persistent store separately in a cron job.
 *
 * @see /packages/server/lib/crons/persistAccountUsage.ts
 */
export class HybridAccountUsageStore implements AccountUsageStore {
    constructor(
        private readonly cacheStore: AccountUsageStore,
        private readonly persistentStore: AccountUsageStore
    ) {}

    async getUsage(params: GetUsageParams): Promise<number> {
        const cachedUsage = await this.cacheStore.getUsage(params);
        if (cachedUsage) {
            return cachedUsage;
        }

        const persistedUsage = await this.persistentStore.getUsage(params);
        if (persistedUsage) {
            await this.cacheStore.setUsage({ ...params, value: persistedUsage });
            return persistedUsage;
        }

        return this.cacheStore.setUsage({ ...params, value: 0 });
    }

    async setUsage(params: SetUsageParams): Promise<number> {
        return this.cacheStore.setUsage(params);
    }

    async incrementUsage(params: IncrementUsageParams): Promise<number> {
        return this.cacheStore.incrementUsage(params);
    }
}
