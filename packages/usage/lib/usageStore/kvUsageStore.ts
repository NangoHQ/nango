import { startOfMonth } from '@nangohq/utils';

import type { UsageStore } from './usageStore.js';
import type { UsageMetric } from '../metrics.js';
import type { KVStore } from '@nangohq/kvstore';

const MONTH_IN_MS = 31 * 24 * 60 * 60 * 1000;

export class KvUsageStore implements UsageStore {
    constructor(private readonly kvStore: KVStore) {}

    async getUsage(accountId: number, metric: UsageMetric, month?: Date): Promise<number> {
        const key = this.getKey(accountId, metric, month);
        const value = await this.kvStore.get(key);
        return value ? Number(value) : 0;
    }

    async setUsage(accountId: number, metric: UsageMetric, value: number, month?: Date): Promise<number> {
        const key = this.getKey(accountId, metric, month);
        await this.kvStore.set(key, value.toString(), { ttlInMs: MONTH_IN_MS });
        return value;
    }

    async incrementUsage(accountId: number, metric: UsageMetric, delta?: number, month?: Date): Promise<number> {
        const key = this.getKey(accountId, metric, month);
        return this.kvStore.incr(key, { delta: delta ?? 1, ttlInMs: MONTH_IN_MS });
    }

    private getKey(accountId: number, metric: UsageMetric, month?: Date): string {
        const startOfMonthDate = startOfMonth(month ?? new Date());

        // YYYY-MM
        const monthString = `${startOfMonthDate.getFullYear()}-${String(startOfMonthDate.getMonth() + 1).padStart(2, '0')}`;
        return `usage:${accountId}:${metric}:${monthString}`;
    }
}
