import type { UsageMetric } from '@nangohq/types';

/**
 * What a period of usage would cost on Pay-as-you-go.
 *
 * The rates live here rather than anywhere reachable from the frontend: `planToApi` spreads every
 * `DBPlan` column to the browser, and `@nangohq/types` is bundled into the webapp. Callers get
 * computed cents; nothing ships a rate.
 */

export type PayAsYouGoMetric = Extract<UsageMetric, 'connections' | 'function_duration_seconds' | 'data_transfer'>;

export const PAY_AS_YOU_GO_METRICS: readonly PayAsYouGoMetric[] = ['connections', 'function_duration_seconds', 'data_transfer'];

const CENTS_PER_CONNECTION = 29;
const CENTS_PER_COMPUTE_HOUR = 72;
const CENTS_PER_TRANSFER_GB = 50;

const SECONDS_PER_HOUR = 3600;
/** Decimal GB, matching both the published rate and Orb's own billable metric. */
const BYTES_PER_GB = 1_000_000_000;

const MINIMUM_IN_CENTS = 5_000;
const GROWTH_ADD_ON_IN_CENTS = 45_000;

/** Metered quantities in each metric's own stored unit: an average, whole seconds, and bytes. */
export type PayAsYouGoQuantities = Record<PayAsYouGoMetric, number>;

export interface PayAsYouGoProjection {
    /** Integer cents per metric, before the minimum. */
    metrics: Record<PayAsYouGoMetric, number>;
    subtotalInCents: number;
    minimumInCents: number;
    /** True when usage came in under the minimum, so the total is the floor rather than the subtotal. */
    minimumApplied: boolean;
    growthAddOnInCents: number;
    totalInCents: number;
}

function quantity(value: number, metric: PayAsYouGoMetric): number {
    // A metric with no rows reaches us as 0 already, so anything unusable here is a broken read.
    // Refusing beats quoting a number we can't stand behind.
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`unusable_quantity_for_${metric}`);
    }
    return value;
}

export function projectPayAsYouGo(quantities: PayAsYouGoQuantities, { isGrowth }: { isGrowth: boolean }): PayAsYouGoProjection {
    // Each charge converts to the unit its rate is published in before multiplying, and rounds once,
    // so the rows always add up to the subtotal shown beneath them.
    const metrics: Record<PayAsYouGoMetric, number> = {
        connections: Math.round(quantity(quantities.connections, 'connections') * CENTS_PER_CONNECTION),
        function_duration_seconds: Math.round(
            (quantity(quantities.function_duration_seconds, 'function_duration_seconds') / SECONDS_PER_HOUR) * CENTS_PER_COMPUTE_HOUR
        ),
        data_transfer: Math.round((quantity(quantities.data_transfer, 'data_transfer') / BYTES_PER_GB) * CENTS_PER_TRANSFER_GB)
    };

    const subtotalInCents = metrics.connections + metrics.function_duration_seconds + metrics.data_transfer;
    const growthAddOnInCents = isGrowth ? GROWTH_ADD_ON_IN_CENTS : 0;

    return {
        metrics,
        subtotalInCents,
        minimumInCents: MINIMUM_IN_CENTS,
        minimumApplied: subtotalInCents < MINIMUM_IN_CENTS,
        growthAddOnInCents,
        // The minimum covers the three usage prices only; the add-on sits outside it. Verified
        // against a live Orb invoice, where a $0.18 usage period billed $46.67 of minimum plus the
        // add-on in full rather than $50 all-in.
        totalInCents: Math.max(subtotalInCents, MINIMUM_IN_CENTS) + growthAddOnInCents
    };
}
