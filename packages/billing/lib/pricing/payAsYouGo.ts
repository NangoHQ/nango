import type { UsageMetric } from '@nangohq/types';

/**
 * Rates stay in this package. `planToApi` copies every plan column into its response, and
 * `@nangohq/types` ships inside the webapp bundle.
 */

export type PayAsYouGoMetric = Extract<UsageMetric, 'connections' | 'function_duration_seconds' | 'data_transfer'>;

export const PAY_AS_YOU_GO_METRICS: readonly PayAsYouGoMetric[] = ['connections', 'function_duration_seconds', 'data_transfer'];

const CENTS_PER_CONNECTION = 29;
const CENTS_PER_COMPUTE_HOUR = 72;
const CENTS_PER_TRANSFER_GB = 50;

const SECONDS_PER_HOUR = 3600;
/** Decimal GB, not GiB — the unit the published rate and Orb's metric both use. */
const BYTES_PER_GB = 1_000_000_000;

const MINIMUM_IN_CENTS = 5_000;
const GROWTH_ADD_ON_IN_CENTS = 45_000;

/** Each metric in its stored unit: a running average, whole seconds, bytes. */
export type PayAsYouGoQuantities = Record<PayAsYouGoMetric, number>;

export interface PayAsYouGoProjection {
    /** Integer cents per metric, before the minimum. */
    metrics: Record<PayAsYouGoMetric, number>;
    subtotalInCents: number;
    minimumInCents: number;
    minimumApplied: boolean;
    growthAddOnInCents: number;
    totalInCents: number;
}

function quantity(value: number, metric: PayAsYouGoMetric): number {
    // Zero is a real quantity. A non-finite one means the usage read failed.
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`unusable_quantity_for_${metric}`);
    }
    return value;
}

export function projectPayAsYouGo(quantities: PayAsYouGoQuantities, { isGrowth }: { isGrowth: boolean }): PayAsYouGoProjection {
    // Round per metric, so the rows add up to the subtotal.
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
        // The minimum covers the three usage prices only. The add-on sits outside it.
        totalInCents: Math.max(subtotalInCents, MINIMUM_IN_CENTS) + growthAddOnInCents
    };
}
