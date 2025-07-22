import type { UsageMetric } from '../metrics.js';

export interface GetUsageParams {
    accountId: number;
    metric: UsageMetric;
    month?: Date;
}
export interface SetUsageParams {
    accountId: number;
    metric: UsageMetric;
    value: number;
    month?: Date;
}
export interface IncrementUsageParams {
    accountId: number;
    metric: UsageMetric;
    delta?: number;
    month?: Date;
}

export interface UsageStore {
    getUsage(params: GetUsageParams): Promise<number>;
    setUsage(params: SetUsageParams): Promise<number>;
    incrementUsage(params: IncrementUsageParams): Promise<number>;
}
