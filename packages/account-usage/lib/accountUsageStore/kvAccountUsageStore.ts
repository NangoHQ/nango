import { startOfMonth } from '@nangohq/utils';

import type { AccountUsageStore, GetUsageParams, IncrementUsageParams, SetUsageParams } from './accountUsageStore.js';
import type { KVStore } from '@nangohq/kvstore';
import type { AccountUsageIncrementableMetric } from '@nangohq/types';

const MONTH_IN_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * A key-value store backed account usage store.
 * Uses a key-value store to store usage.
 */
export class KvAccountUsageStore implements AccountUsageStore {
    constructor(private readonly kvStore: KVStore) {}

    async getUsage({ accountId, metric, month }: GetUsageParams): Promise<number> {
        const key = this.getKey(accountId, metric, month);
        const value = await this.kvStore.get(key);
        return value ? Number(value) : 0;
    }

    async setUsage({ accountId, metric, value, month }: SetUsageParams): Promise<number> {
        const key = this.getKey(accountId, metric, month);
        await this.kvStore.set(key, value.toString(), { ttlMs: MONTH_IN_MS });
        return value;
    }

    async incrementUsage({ accountId, metric, delta, month }: IncrementUsageParams): Promise<number> {
        const key = this.getKey(accountId, metric, month);
        return this.kvStore.incr(key, { delta: delta ?? 1, ttlMs: MONTH_IN_MS });
    }

    private getKey(accountId: number, metric: AccountUsageIncrementableMetric, month?: Date): string {
        const startOfMonthDate = startOfMonth(month ?? new Date());

        // YYYY-MM
        const monthString = `${startOfMonthDate.getFullYear()}-${String(startOfMonthDate.getMonth() + 1).padStart(2, '0')}`;
        return `usage:${accountId}:${metric}:${monthString}`;
    }
}
