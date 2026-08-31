import { uuidv7 } from 'uuidv7';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../../envs.js';
import { putOrbCustomerSchema } from './types.js';

import type {
    BillingAddress,
    BillingCustomer,
    BillingEvent,
    BillingInvoicingDetails,
    BillingPeriodCosts,
    BillingSpendAlert,
    BillingUpcomingInvoice,
    Result,
    UsageMetric
} from '@nangohq/types';
import type Orb from 'orb-billing';

// Keyed on the EVENT's timestamp, not the wall clock, so a batched or
// late-emitted event whose logical time is pre-cutover ships under the
// pre-cutover name and vice versa. See BILLING_EVENTS_CUTOVER_AT in
// packages/utils.
function cutoverAppliesTo(eventTimestamp: Date): boolean {
    return !!envs.BILLING_EVENTS_CUTOVER_AT && eventTimestamp >= new Date(envs.BILLING_EVENTS_CUTOVER_AT);
}

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
        total: string;
        price: { price_type: string; name: string; currency?: string | null; billable_metric?: { id: string } | null };
    }[];
}

export function fromOrbPeriodCosts(costs: { data: OrbCostBucket[] }, now: Date): BillingPeriodCosts | null {
    // Cumulative buckets accumulate over the period, so the one ending last spans all of it.
    const period = costs.data.reduce<OrbCostBucket | null>(
        (latest, bucket) => (latest && Date.parse(latest.timeframe_end) >= Date.parse(bucket.timeframe_end) ? latest : bucket),
        null
    );
    // An ended subscription still answers with its final period rather than erroring, and those costs
    // are not what is being billed now. A NaN from a malformed timeframe_end must reject explicitly —
    // NaN <= now.getTime() is always false, so it would otherwise read as a current period.
    const periodEnd = period ? Date.parse(period.timeframe_end) : NaN;
    if (!period || Number.isNaN(periodEnd) || periodEnd <= now.getTime()) {
        return null;
    }

    const metrics: Partial<Record<UsageMetric, number>> = {};
    const malformedMetrics: UsageMetric[] = [];
    const flagged: BillingPeriodCosts['flagged'] = [];
    let fullyAttributed = true;
    let currency: string | null = null;

    for (const priceCost of period.per_price_costs) {
        const { price } = priceCost;
        // Excluded, so the metrics never sum to the period's invoice total — the base fee isn't split
        // across rows.
        if (price.price_type === 'fixed_price') {
            continue;
        }

        const metric = price.billable_metric ? (orbBillableMetricToUsageMetric[price.billable_metric.id] ?? null) : null;
        const priceCurrency = normalizeIsoCurrency(price.currency);
        const amountInCents = orbAmountToCents(priceCost.total);
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

    return { metrics, malformedMetrics, fullyAttributed, flagged, currency };
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

export function toOrbEvent(event: BillingEvent): Orb.Events.EventIngestParams.Event {
    const { idempotencyKey, timestamp, accountId, ...rest } = event.properties;

    // orb doesn't accept nested properties, we need to flatten them with dot notation
    const properties: Record<string, string | number | boolean> = {};
    for (const [topLevelKey, value] of Object.entries(rest)) {
        if (!value) continue;
        if (typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) {
                properties[`${topLevelKey}.${k}`] = v;
            }
        } else {
            properties[topLevelKey] = value;
        }
    }

    return {
        event_name: `${event.type}${cutoverAppliesTo(timestamp) ? '_http' : ''}`,
        idempotency_key: idempotencyKey || uuidv7(),
        external_customer_id: accountId.toString(),
        timestamp: timestamp.toISOString(),
        properties
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
