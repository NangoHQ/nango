import { formatMoneyFromCents } from './money';

import type { GetBillingPeriodCosts, GetProjectedCosts, UsageMetric } from '@nangohq/types';

export interface UsageRowCharge {
    formatted: string | null;
    pending: boolean;
}

/** Null when charges don't apply at all, so the column is absent rather than empty. */
export type UsageChargeLookup = ((metric: UsageMetric) => UsageRowCharge) | null;

interface BuildArgs {
    enabled: boolean;
    isPending: boolean;
    isError: boolean;
    data: GetBillingPeriodCosts['Success'] | undefined;
    /** Use `dash` when $0.00 could be mistaken for a free price. */
    unpriced?: 'zero' | 'dash';
}

const NO_FIGURE: UsageRowCharge = { formatted: null, pending: false };
const PENDING: UsageRowCharge = { formatted: null, pending: true };

export function buildUsageRowCharges(args: BuildArgs): UsageChargeLookup {
    if (!args.enabled) {
        return null;
    }

    if (args.isPending) {
        return () => PENDING;
    }

    // react-query keeps the last success on a failed refetch; a stale amount is worse than none.
    if (args.isError || !args.data) {
        return () => NO_FIGURE;
    }

    const { metrics, malformedMetrics, fullyAttributed, currency, noCosts } = args.data.data;
    if (noCosts) {
        return () => NO_FIGURE;
    }

    return (metric) => {
        // A real price exists but its charge couldn't be read — a dash, not a $0 we can't stand behind.
        if (malformedMetrics.includes(metric)) {
            return NO_FIGURE;
        }
        const amountInCents = metrics[metric];
        if (amountInCents === undefined) {
            // No price for this metric reads as zero, unless some other price went unattributed — that
            // money could belong to this metric, so it states no figure rather than claiming zero.
            return fullyAttributed && args.unpriced !== 'dash' ? { formatted: formatMoneyFromCents(0, currency), pending: false } : NO_FIGURE;
        }
        return { formatted: formatMoneyFromCents(amountInCents, currency), pending: false };
    };
}

interface BuildProjectedArgs {
    enabled: boolean;
    isPending: boolean;
    isError: boolean;
    data: GetProjectedCosts['Success'] | undefined;
}

/** Every metric here is priced, so an absent one is a real $0 rather than money left unattributed. */
export function buildProjectedCharges(args: BuildProjectedArgs): UsageChargeLookup {
    if (!args.enabled) {
        return null;
    }

    if (args.isPending) {
        return () => PENDING;
    }

    if (args.isError || !args.data) {
        return () => NO_FIGURE;
    }

    const { metrics, currency, notApplicable } = args.data.data;
    if (notApplicable) {
        return null;
    }

    return (metric) => ({ formatted: formatMoneyFromCents(metrics[metric] ?? 0, currency), pending: false });
}
