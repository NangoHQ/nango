import type { AccountUsageMetric } from '../metrics.js';

export interface GetUsageParams {
    accountId: number;
    metric: AccountUsageMetric;
    month?: Date;
}
export interface SetUsageParams {
    accountId: number;
    metric: AccountUsageMetric;
    value: number;
    month?: Date;
}
export interface IncrementUsageParams {
    accountId: number;
    metric: AccountUsageMetric;
    delta?: number;
    month?: Date;
}

export interface AccountUsageStore {
    getUsage(params: GetUsageParams): Promise<number>;
    setUsage(params: SetUsageParams): Promise<number>;
    incrementUsage(params: IncrementUsageParams): Promise<number>;
}
