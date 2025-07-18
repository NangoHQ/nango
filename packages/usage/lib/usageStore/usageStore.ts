import type { UsageMetric } from '../metrics.js';

export interface UsageStore {
    getUsage(accountId: number, metric: UsageMetric, month?: Date): Promise<number>;
    setUsage(accountId: number, metric: UsageMetric, value: number, month?: Date): Promise<number>;
    incrementUsage(accountId: number, metric: UsageMetric, delta?: number, month?: Date): Promise<number>;
}
