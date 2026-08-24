import { formatMoneyFromCents } from './money';

import type { GetBillingPeriodCosts, UsageMetric } from '@nangohq/types';

export interface UsageRowCharge {
    /** Formatted amount, or null when there is no figure to state. */
    formatted: string | null;
    /** Still resolving — show a placeholder rather than a figure. */
    pending: boolean;
}

/** Null when charges don't apply at all, so the column is absent rather than empty. */
export type UsageChargeLookup = ((metric: UsageMetric) => UsageRowCharge) | null;

interface BuildArgs {
    /** False on Free, on a past month, or without the rollout flag. */
    enabled: boolean;
    isPending: boolean;
    isError: boolean;
    data: GetBillingPeriodCosts['Success'] | undefined;
}

const NO_FIGURE: UsageRowCharge = { formatted: null, pending: false };
const PENDING: UsageRowCharge = { formatted: null, pending: true };

/**
 * Resolves each metric's charge for the period.
 *
 * A metric Orb returns no price for reads as zero, since no price means no charge — several accounts
 * have had a metric's price removed by hand and genuinely owe nothing on it. That only holds while
 * every charge was attributed: an unattributed one could belong to any of those metrics, so once
 * `unattributedInCents` is non-zero they all state no figure rather than claiming zero.
 */
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

    const { metrics, unattributedInCents, currency } = args.data.data;
    const fullyAttributed = unattributedInCents === 0;

    return (metric) => {
        const amountInCents = metrics[metric];
        if (amountInCents === undefined) {
            return fullyAttributed ? { formatted: formatMoneyFromCents(0, currency), pending: false } : NO_FIGURE;
        }
        return { formatted: formatMoneyFromCents(amountInCents, currency), pending: false };
    };
}
