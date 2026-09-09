import { Err, Ok, report } from '@nangohq/utils';

import { growthAddonPriceId } from './catalogue.js';
import { putOrbCustomerSchema } from './types.js';

import type {
    BillingAddress,
    BillingCustomer,
    BillingInvoicingDetails,
    BillingPeriodCosts,
    BillingSpendAlert,
    BillingSubscription,
    BillingUpcomingInvoice,
    Result,
    UsageMetric
} from '@nangohq/types';
import type Orb from 'orb-billing';

/**
 * Orb money as an integer number of cents, read off the decimal string rather than via
 * `Number(x) * 100` — that is lossy, giving 1998.9999999999998 for '19.99' instead of 1999.
 */
export function orbAmountToCents(amount: string): number | null {
    const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(amount.trim());
    if (!match) {
        return null;
    }

    // Groups 2 and 3 are guaranteed by the pattern, but `noUncheckedIndexedAccess` can't see that.
    const whole = match[2] ?? '0';
    // Some invoices carry more than two decimals; the extra digits are dropped, not rounded.
    const fraction = match[3] ?? '';
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
    return match[1] === '-' ? -cents : cents;
}

/** Orb denominates some invoices in a `credits` unit rather than an ISO 4217 currency. */
export function normalizeIsoCurrency(currency: string | null | undefined): string | null {
    const code = currency?.trim().toUpperCase();
    return code && /^[A-Z]{3}$/.test(code) ? code : null;
}

export function fromOrbUpcomingInvoice(invoice: { amount_due: string; currency: string }): BillingUpcomingInvoice | null {
    const amountInCents = orbAmountToCents(invoice.amount_due);
    if (amountInCents === null) {
        return null;
    }

    const currency = normalizeIsoCurrency(invoice.currency);
    if (!currency) {
        return null;
    }

    return { amountInCents, currency };
}

/**
 * Keyed on billable-metric id, not price name: a price's name can change (verified — four of these
 * metrics bill under two different names each) while its id stays put. Ids are environment-specific
 * though, and prod and test mode share none, so both sets live here.
 */
const orbBillableMetricToUsageMetric: Record<string, UsageMetric> = {
    // prod
    '8aAyMTG6HafmZpqJ': 'connections',
    bydJcn2HUaYSGQ9S: 'proxy',
    AinLoHESvrXqhEig: 'records',
    j46jUSMMya8jqhkR: 'webhook_forwards',
    S6QcTddptFM8tvFc: 'function_executions',
    SuusTqcXhhZVq2w4: 'function_compute_gbms',
    '7TXEdbnT3gWPqkns': 'function_logs',
    // The new pricing reuses `connections` above, so only two of its three metrics are new here.
    RNskBsYUvTYLsjV2: 'data_transfer',
    ZrAoynYimCwtmFSP: 'function_duration_seconds',
    // test mode, shared by dev, staging and local
    QFf9VosRcMWkZvZq: 'connections',
    T9MRaCkFi4SEf2ku: 'proxy',
    FTTFTvuqDr7YbcRB: 'records',
    D8Gu4UPEJ3tUWJJ3: 'webhook_forwards',
    '29oZqvoENLmauqkY': 'function_executions',
    '4jYMmFPKUQAKKL2T': 'function_compute_gbms',
    '62CoZikHXhPoS6yt': 'function_logs',
    // Test mode prices connections on its own metric rather than reusing the one above.
    d43sZsrkdUE9gCUv: 'connections',
    '5wA8CWsfttHSaTw3': 'function_duration_seconds',
    cJe5pcF2MQ8pvBrF: 'data_transfer'
};

interface OrbCostBucket {
    timeframe_end: string;
    per_price_costs: {
        price_id: string;
        subtotal: string;
        price: { price_type: string; name: string; currency?: string | null; billable_metric?: { id: string } | null };
    }[];
}

export function fromOrbPeriodCosts(costs: { data: OrbCostBucket[] }, now: Date, opts: { explicitTimeframe?: boolean } = {}): BillingPeriodCosts | null {
    // Cumulative buckets accumulate over the period, so the one ending last spans all of it.
    const period = costs.data.reduce<OrbCostBucket | null>(
        (latest, bucket) => (latest && Date.parse(latest.timeframe_end) >= Date.parse(bucket.timeframe_end) ? latest : bucket),
        null
    );
    // Orb returns its last period after a subscription ends. Accept it only when the request includes dates.
    const periodEnd = period ? Date.parse(period.timeframe_end) : NaN;
    if (!period || Number.isNaN(periodEnd) || (!opts.explicitTimeframe && periodEnd <= now.getTime())) {
        return null;
    }

    const metrics: Partial<Record<UsageMetric, number>> = {};
    const malformedMetrics: UsageMetric[] = [];
    const flagged: BillingPeriodCosts['flagged'] = [];
    // Read currency from usage prices. A subscription with only fixed prices has no metric costs.
    const fixedPrices: { priceId: string; priceName: string; amountInCents: number | null; currency: string | null }[] = [];
    let fullyAttributed = true;
    let currency: string | null = null;

    for (const priceCost of period.per_price_costs) {
        const { price } = priceCost;
        // Orb spreads minimum charges and discounts across price totals. Read usage charges from `subtotal`.
        const amountInCents = orbAmountToCents(priceCost.subtotal);
        const priceCurrency = normalizeIsoCurrency(price.currency);

        if (price.price_type === 'fixed_price') {
            fixedPrices.push({ priceId: priceCost.price_id, priceName: price.name, amountInCents, currency: priceCurrency });
            continue;
        }

        const metric = price.billable_metric ? (orbBillableMetricToUsageMetric[price.billable_metric.id] ?? null) : null;
        const readable = priceCurrency !== null && (currency === null || priceCurrency === currency) && amountInCents !== null;

        if (!readable) {
            // A real price we couldn't read (unparseable amount, or a currency other prices don't
            // share). Its own metric, if we know one, can't claim a number — but every other price in
            // the bucket is independent and still trustworthy, so only that metric is affected.
            if (metric) {
                malformedMetrics.push(metric);
            } else {
                fullyAttributed = false;
            }
            flagged.push({ priceId: priceCost.price_id, priceName: price.name, metric, amountInCents });
            continue;
        }
        currency = priceCurrency;

        if (!metric) {
            // A priced metric we don't recognise: an unpriced row can't safely claim $0, since this
            // money might be one of theirs.
            fullyAttributed = false;
            flagged.push({ priceId: priceCost.price_id, priceName: price.name, metric: null, amountInCents });
            continue;
        }

        // Orb allows several prices on one metric.
        metrics[metric] = (metrics[metric] ?? 0) + amountInCents;
    }

    if (!currency) {
        return null;
    }

    let fixedInCents = 0;
    for (const fixed of fixedPrices) {
        if (fixed.amountInCents === null || fixed.currency !== currency) {
            // Keep `fullyAttributed` unchanged. It describes usage prices, not fixed prices.
            flagged.push({ priceId: fixed.priceId, priceName: fixed.priceName, metric: null, amountInCents: fixed.amountInCents });
            continue;
        }
        fixedInCents += fixed.amountInCents;
    }

    return { metrics, malformedMetrics, fullyAttributed, flagged, fixedInCents, currency };
}

/**
 * Orb states alert thresholds as a JSON number in major units, not the decimal string invoices use,
 * so `orbAmountToCents` doesn't apply.
 */
export function fromOrbAlert(alert: { id: string; currency: string | null; thresholds: { value: number }[] | null }): BillingSpendAlert | null {
    const threshold = alert.thresholds?.[0];
    if (!threshold) {
        return null;
    }

    return {
        id: alert.id,
        // Rounded, not truncated: we wrote this value ourselves as whole cents, so any fractional
        // remainder is float drift from the round-trip, not a real amount.
        thresholdInCents: Math.round(threshold.value * 100),
        currency: normalizeIsoCurrency(alert.currency)
    };
}

export function toOrbPutCustomerPayload(invoicingDetails: BillingInvoicingDetails): Result<Orb.CustomerUpdateByExternalIDParams> {
    const val = putOrbCustomerSchema.safeParse(invoicingDetails);
    if (!val.success) {
        return Err(val.error);
    }

    const payload: Orb.CustomerUpdateByExternalIDParams = {
        name: invoicingDetails.legalEntityName,
        email: invoicingDetails.email,
        additional_emails: val.data.additionalEmails,
        tax_id: val.data.taxId
    };

    if (val.data.address) {
        payload.billing_address = {
            country: val.data.address.country,
            line1: val.data.address.line1,
            line2: val.data.address.line2,
            city: val.data.address.city,
            state: val.data.address.state,
            postal_code: val.data.address.postalCode
        };
    } else {
        payload.billing_address = null;
    }

    return Ok(payload);
}

/**
 * Parses Orb's `price_intervals` for the presence of the growth add-on price and its active interval.
 *
 * An interval that hasn't started or has already finished gets ignored.
 */
export function growthAddonStateFromOrb(
    priceIntervals: { id?: string; start_date?: string | null; end_date: string | null; price?: { external_price_id?: string | null } | null }[],
    referenceDate: Date = new Date()
): Pick<BillingSubscription, 'hasGrowthFeatures' | 'growthFeaturesEndsAt' | 'growthFeaturesPriceIntervalId'> {
    for (const interval of priceIntervals) {
        if (interval.price?.external_price_id !== growthAddonPriceId) {
            continue;
        }

        const startsAt = parseOrbDate(interval.start_date, { field: 'start_date', priceIntervalId: interval.id });
        if (startsAt && startsAt > referenceDate) {
            continue;
        }

        const endsAt = parseOrbDate(interval.end_date, { field: 'end_date', priceIntervalId: interval.id });
        if (endsAt && endsAt <= referenceDate) {
            continue;
        }

        return { hasGrowthFeatures: true, growthFeaturesEndsAt: endsAt, growthFeaturesPriceIntervalId: interval.id ?? null };
    }

    return { hasGrowthFeatures: false, growthFeaturesEndsAt: null, growthFeaturesPriceIntervalId: null };
}

function parseOrbDate(value: string | null | undefined, context: { field: 'start_date' | 'end_date'; priceIntervalId: string | undefined }): Date | null {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    // Defensive check: we should never receive an invalid date from Orb.
    if (Number.isNaN(parsed.getTime())) {
        report(new Error('orb_unparseable_price_interval_date'), { ...context, value });
        return null;
    }
    return parsed;
}

export function fromOrbCustomer(orbCustomer: Orb.Customer): BillingCustomer {
    return {
        id: orbCustomer.id,
        portalUrl: orbCustomer.portal_url,
        invoicingDetails: {
            legalEntityName: orbCustomer.name,
            email: orbCustomer.email,
            additionalEmails: orbCustomer.additional_emails ?? [],
            address: orbCustomer.billing_address ? fromOrbAddress(orbCustomer.billing_address) : null,
            taxId: orbCustomer.tax_id
        }
    };
}

export function fromOrbAddress(orbAddress: Orb.Address): BillingAddress {
    return {
        line1: orbAddress.line1,
        line2: orbAddress.line2,
        city: orbAddress.city,
        state: orbAddress.state,
        postalCode: orbAddress.postal_code,
        country: orbAddress.country
    };
}

export function orbMetricToUsageMetric(name: string): UsageMetric | null {
    // Not ideal to match on BillingMetric name but Orb only exposes the user friendly name or internal ids
    const lowerName = name.toLowerCase();
    // order matters here
    if (lowerName.includes('legacy')) return null;
    if (lowerName === 'function runtime (s)') return 'function_duration_seconds';
    if (lowerName.includes('logs')) return 'function_logs';
    if (lowerName.includes('proxy')) return 'proxy';
    if (lowerName.includes('forward')) return 'webhook_forwards';
    if (lowerName.includes('compute')) return 'function_compute_gbms';
    if (lowerName.includes('function')) return 'function_executions';
    if (lowerName.includes('connections')) return 'connections';
    if (lowerName.includes('records')) return 'records';

    return null;
}
