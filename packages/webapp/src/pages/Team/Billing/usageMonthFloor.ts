import { EARLIEST_USAGE_MONTH_MS } from './usageBreakdown';

export type UsageMonthFloorReason = 'data-start' | 'account-created';

export function usageMonthFloorMs(accountCreatedAt: string | undefined): number {
    const created = accountCreatedAt ? new Date(accountCreatedAt) : null;
    if (!created || Number.isNaN(created.getTime())) {
        return EARLIEST_USAGE_MONTH_MS;
    }
    return Math.max(EARLIEST_USAGE_MONTH_MS, Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), 1));
}

export function usageMonthFloorReason(floorMs: number): UsageMonthFloorReason {
    return floorMs > EARLIEST_USAGE_MONTH_MS ? 'account-created' : 'data-start';
}
