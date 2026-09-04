import { formatMoneyFromCents } from './money';

import type { GetUpcomingInvoice } from '@nangohq/types';

export interface MinimumSpendRow {
    /** What the minimum adds on top of the metric charges. */
    formatted: string;
    tooltip: string;
}

interface BuildArgs {
    enabled: boolean;
    minimum: GetUpcomingInvoice['Success']['data']['minimum'];
    currency: string | null;
}

export function buildMinimumSpendRow({ enabled, minimum, currency }: BuildArgs): MinimumSpendRow | null {
    if (!enabled || !minimum) {
        return null;
    }

    const formatted = formatMoneyFromCents(minimum.topUpInCents, currency);
    const enforced = formatMoneyFromCents(minimum.enforcedInCents, currency);
    if (formatted === null || enforced === null) {
        return null;
    }

    return {
        formatted,
        // The invoice's figure, not the plan's: Orb prorates the minimum over a partial period.
        tooltip: `Tops this period's usage up to its ${enforced} minimum. A partial period is charged a prorated share of the monthly minimum.`
    };
}
