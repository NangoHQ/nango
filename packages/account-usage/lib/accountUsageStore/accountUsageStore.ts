import type { AccountUsageIncrementableMetric } from '@nangohq/types';

export interface GetUsageParams {
    accountId: number;
    metric: AccountUsageIncrementableMetric;
    month?: Date;
}
export interface SetUsageParams {
    accountId: number;
    metric: AccountUsageIncrementableMetric;
    value: number;
    month?: Date;
}
export interface IncrementUsageParams {
    accountId: number;
    metric: AccountUsageIncrementableMetric;
    delta?: number;
    month?: Date;
}

export interface AccountUsageStore {
    getUsage(params: GetUsageParams): Promise<number>;
    setUsage(params: SetUsageParams): Promise<number>;
    incrementUsage(params: IncrementUsageParams): Promise<number>;
}
